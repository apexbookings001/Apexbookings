-- A response-time notice is a persisted system message. Keeping its markers on
-- the conversation makes it idempotent across refreshes, retries, and devices.
alter table public.support_conversations
  add column if not exists last_admin_message_at timestamptz,
  add column if not exists last_response_notice_at timestamptz;

update public.support_conversations conversation
set last_admin_message_at = (
  select max(message.created_at)
  from public.chat_messages message
  where message.conversation_id = conversation.id
    and message.sender_type = 'admin'
    and message.deleted_at is null
)
where conversation.last_admin_message_at is null;

create or replace function public.track_support_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_type = 'admin' then
    -- A genuine agent reply begins a fresh unanswered-support cycle.
    update public.support_conversations
    set last_admin_message_at = new.created_at,
        last_response_notice_at = null,
        last_activity_at = new.created_at,
        updated_at = now()
    where id = new.conversation_id;
  elsif new.sender_type = 'customer' then
    update public.support_conversations
    set last_activity_at = new.created_at,
        updated_at = now()
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_track_support_conversation on public.chat_messages;
create trigger chat_messages_track_support_conversation
after insert on public.chat_messages
for each row execute function public.track_support_conversation_message();

create or replace function public.public_support_snapshot(conversation_access_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', conversation.id,
      'eventId', conversation.event_id,
      'customer', customer.full_name,
      'email', customer.email,
      'status', conversation.status,
      'notes', conversation.notes,
      'createdAt', conversation.created_at,
      'updatedAt', conversation.updated_at,
      'lastActivity', conversation.last_activity_at,
      'accessToken', conversation.access_token
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', message.id,
        'type', message.message_type,
        'body', message.body,
        'from', case message.sender_type when 'customer' then 'customer' when 'system' then 'system' else 'admin' end,
        'createdAt', message.created_at,
        'readAt', message.read_at,
        'status', case when message.read_at is not null then 'read' when message.delivered_at is not null then 'delivered' else 'sent' end,
        'attachment', message.metadata -> 'attachment',
        'replyTo', message.metadata -> 'replyTo',
        'reactions', message.metadata -> 'reactions',
        'internal', coalesce((message.metadata ->> 'internal')::boolean, false)
      ) order by message.created_at)
      from public.chat_messages message
      where message.conversation_id = conversation.id and message.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.support_conversations conversation
  join public.customers customer on customer.id = conversation.customer_id
  where conversation.access_token = conversation_access_token and conversation.deleted_at is null;
$$;

create or replace function public.send_public_support_message(conversation_access_token uuid, message_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_conversation public.support_conversations;
  inserted_message public.chat_messages;
  response_notice public.chat_messages;
  previous_activity_at timestamptz;
  should_add_notice boolean := false;
begin
  select * into target_conversation
  from public.support_conversations
  where access_token = conversation_access_token and deleted_at is null
  for update;
  if target_conversation.id is null then raise exception 'Conversation was not found'; end if;
  if nullif(trim(message_payload ->> 'body'), '') is null and message_payload -> 'attachment' is null then raise exception 'Message content is required'; end if;

  previous_activity_at := target_conversation.last_activity_at;
  insert into public.chat_messages(conversation_id, sender_type, body, message_type, delivered_at, metadata)
  values (
    target_conversation.id,
    'customer',
    coalesce(message_payload ->> 'body', ''),
    coalesce(nullif(message_payload ->> 'type', ''), 'text'),
    now(),
    jsonb_build_object('attachment', message_payload -> 'attachment', 'replyTo', message_payload -> 'replyTo')
  ) returning * into inserted_message;

  -- The first message receives a notice. A further notice is only possible
  -- after a real 30-minute return to an unanswered conversation. An admin
  -- reply clears the marker via the trigger above.
  should_add_notice := target_conversation.last_response_notice_at is null
    or (
      target_conversation.last_admin_message_at is null
      and previous_activity_at <= now() - interval '30 minutes'
    );

  if should_add_notice then
    insert into public.chat_messages(conversation_id, sender_type, body, message_type, delivered_at, metadata)
    values (
      target_conversation.id,
      'system',
      'Thanks for your message. Our typical response time is between 2 and 10 minutes. Please stay on this page or check back later for a reply from customer support.',
      'text',
      now(),
      jsonb_build_object('systemType', 'response_notice')
    ) returning * into response_notice;
  end if;

  update public.support_conversations
  set last_activity_at = now(),
      last_response_notice_at = case when should_add_notice then response_notice.created_at else last_response_notice_at end,
      updated_at = now()
  where id = target_conversation.id;

  insert into public.notifications(organization_id, type, payload)
  values (target_conversation.organization_id, 'support_message', jsonb_build_object('conversationId', target_conversation.id, 'messageId', inserted_message.id));

  -- Keep the stored customer row at the root for rolling-client compatibility,
  -- with the optional persisted system row carried alongside it.
  return to_jsonb(inserted_message) || jsonb_build_object(
    'responseNotice', case when should_add_notice then to_jsonb(response_notice) else null end
  );
end;
$$;

grant execute on function public.send_public_support_message(uuid, jsonb) to anon, authenticated;

-- Membership-backed authentication, role authorization, and cross-device realtime.

alter table public.organization_members
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists disabled_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.organizations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.media
  add column if not exists metadata jsonb not null default '{}'::jsonb;

drop trigger if exists set_organization_members_updated_at on public.organization_members;
create trigger set_organization_members_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.disabled_at is null
      and member.deleted_at is null
      and member.role in ('owner', 'admin', 'support')
  );
$$;

create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.disabled_at is null
      and member.deleted_at is null
      and member.role = any(allowed_roles)
  );
$$;

create or replace function public.bootstrap_admin_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  organization_id_result uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select member.organization_id
  into organization_id_result
  from public.organization_members member
  where member.user_id = auth.uid()
    and member.disabled_at is null
    and member.deleted_at is null
  limit 1;

  if organization_id_result is not null then
    return organization_id_result;
  end if;

  perform pg_advisory_xact_lock(hashtext('apex-bookings-first-owner'));

  if exists (
    select 1 from public.organization_members member
    where member.disabled_at is null and member.deleted_at is null
  ) then
    raise exception 'This account is not authorized';
  end if;

  insert into public.organizations(name)
  values ('Apex Bookings')
  returning id into organization_id_result;

  insert into public.organization_members(organization_id, user_id, role)
  values (organization_id_result, auth.uid(), 'owner');

  insert into public.settings(organization_id)
  values (organization_id_result)
  on conflict (organization_id) do nothing;

  return organization_id_result;
end;
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member.organization_id
  from public.organization_members member
  where member.user_id = auth.uid()
    and member.disabled_at is null
    and member.deleted_at is null
  limit 1;
$$;

drop policy if exists "members can access memberships" on public.organization_members;
drop policy if exists "owners can read organization memberships" on public.organization_members;
create policy "members can read own membership"
on public.organization_members for select
using (user_id = auth.uid() and disabled_at is null and deleted_at is null);
create policy "owners can read organization memberships"
on public.organization_members for select
using (public.has_organization_role(organization_id, array['owner']));

drop policy if exists "members can access organizations" on public.organizations;
create policy "members read organizations"
on public.organizations for select
using (public.is_organization_member(id));
create policy "owners update organizations"
on public.organizations for update
using (public.has_organization_role(id, array['owner']))
with check (public.has_organization_role(id, array['owner']));

drop policy if exists "members can manage events" on public.events;
create policy "members read events" on public.events for select
using (public.is_organization_member(organization_id));
create policy "administrators manage events" on public.events for all
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

drop policy if exists "members can manage event packages" on public.packages;
create policy "members read event packages" on public.packages for select
using (exists(select 1 from public.events event where event.id = event_id and public.is_organization_member(event.organization_id)));
create policy "administrators manage event packages" on public.packages for all
using (exists(select 1 from public.events event where event.id = event_id and public.has_organization_role(event.organization_id, array['owner','admin'])))
with check (exists(select 1 from public.events event where event.id = event_id and public.has_organization_role(event.organization_id, array['owner','admin'])));

drop policy if exists "members can manage event seats" on public.seats;
create policy "members read event seats" on public.seats for select
using (exists(select 1 from public.events event where event.id = event_id and public.is_organization_member(event.organization_id)));
create policy "administrators manage event seats" on public.seats for all
using (exists(select 1 from public.events event where event.id = event_id and public.has_organization_role(event.organization_id, array['owner','admin'])))
with check (exists(select 1 from public.events event where event.id = event_id and public.has_organization_role(event.organization_id, array['owner','admin'])));

drop policy if exists "members can manage settings" on public.settings;
create policy "members read settings" on public.settings for select
using (public.is_organization_member(organization_id));
create policy "administrators manage settings" on public.settings for all
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

drop policy if exists "members can manage media" on public.media;
create policy "members read media" on public.media for select
using (public.is_organization_member(organization_id));
create policy "administrators manage media" on public.media for all
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

drop policy if exists "members manage payment methods" on public.payment_methods;
create policy "members read payment methods" on public.payment_methods for select
using (public.is_organization_member(organization_id));
create policy "administrators manage payment methods" on public.payment_methods for all
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

drop policy if exists "members manage crypto wallets" on public.crypto_wallets;
create policy "members read crypto wallets" on public.crypto_wallets for select
using (public.is_organization_member(organization_id));
create policy "administrators manage crypto wallets" on public.crypto_wallets for all
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

drop policy if exists "members manage social proof" on public.social_proof_items;
create policy "members read social proof" on public.social_proof_items for select
using (public.is_organization_member(organization_id));
create policy "administrators manage social proof" on public.social_proof_items for all
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

revoke all on function public.bootstrap_admin_workspace() from public, anon;
grant execute on function public.bootstrap_admin_workspace() to authenticated;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'bookings', 'payments', 'notifications', 'support_conversations',
    'chat_messages', 'events', 'settings', 'packages', 'seats',
    'payment_methods', 'crypto_wallets', 'social_proof_items'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

create or replace function public.create_public_checkout(target_event_id uuid, checkout jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_event public.events;
  target_customer_id uuid;
  target_booking_id uuid;
  target_payment_id uuid;
  target_ticket_id uuid;
  booking_reference text;
  generated_ticket_number text;
  requested_method public.payment_method;
  owner_email text;
begin
  select * into target_event
  from public.events
  where id = target_event_id and status = 'published' and deleted_at is null;
  if target_event.id is null then raise exception 'This event is not available for booking'; end if;
  if nullif(trim(checkout ->> 'customerEmail'), '') is null then raise exception 'Customer email is required'; end if;
  if nullif(trim(checkout ->> 'customerName'), '') is null then raise exception 'Customer name is required'; end if;

  insert into public.customers(full_name, email, country, preferred_currency, metadata)
  values (
    trim(checkout ->> 'customerName'),
    lower(trim(checkout ->> 'customerEmail')),
    nullif(checkout ->> 'country', ''),
    coalesce(nullif(checkout ->> 'currency', ''), 'USD'),
    jsonb_build_object('source', 'public_checkout')
  )
  on conflict (email) do update set
    full_name = excluded.full_name,
    country = coalesce(excluded.country, public.customers.country),
    preferred_currency = coalesce(excluded.preferred_currency, public.customers.preferred_currency),
    updated_at = now()
  returning id into target_customer_id;

  booking_reference := coalesce(nullif(checkout ->> 'bookingReference', ''), 'APEX-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)));
  insert into public.bookings(reference, event_id, customer_id, status, payment_state, currency, total_amount, metadata)
  values (
    booking_reference,
    target_event.id,
    target_customer_id,
    'pending',
    'payment_submitted',
    coalesce(nullif(checkout ->> 'currency', ''), 'USD'),
    greatest(coalesce((checkout ->> 'amount')::numeric, 0), 0),
    checkout
  )
  returning id into target_booking_id;

  requested_method := case checkout ->> 'paymentMethod'
    when 'cryptocurrency' then 'bitcoin'::public.payment_method
    when 'paypal' then 'paypal'::public.payment_method
    when 'cash_app' then 'cash_app'::public.payment_method
    when 'bank_transfer' then 'bank_transfer'::public.payment_method
    else 'apple_gift_card'::public.payment_method
  end;

  insert into public.payments(booking_id, method, status, amount, metadata)
  values (target_booking_id, requested_method, 'pending', greatest(coalesce((checkout ->> 'amount')::numeric, 0), 0), checkout)
  returning id into target_payment_id;

  generated_ticket_number := 'TKT-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  insert into public.tickets(booking_id, ticket_number, status)
  values (target_booking_id, generated_ticket_number, 'pending')
  returning id into target_ticket_id;

  insert into public.notifications(organization_id, type, payload)
  values (target_event.organization_id, 'new_booking', jsonb_build_object(
    'bookingId', target_booking_id,
    'paymentId', target_payment_id,
    'reference', booking_reference,
    'customerName', checkout ->> 'customerName',
    'eventName', target_event.name
  ));

  select users.email into owner_email
  from public.organization_members member
  join auth.users users on users.id = member.user_id
  where member.organization_id = target_event.organization_id
    and member.role = 'owner'
    and member.disabled_at is null
    and member.deleted_at is null
  order by member.created_at
  limit 1;

  if owner_email is not null then
    insert into public.email_queue(organization_id, booking_id, kind, recipient, subject, payload)
    values (
      target_event.organization_id,
      target_booking_id,
      'payment_proof_submitted',
      owner_email,
      'New Apex Booking',
      checkout || jsonb_build_object('Booking Reference', booking_reference, 'Event', target_event.name)
    );
  end if;

  return jsonb_build_object(
    'bookingId', target_booking_id,
    'paymentId', target_payment_id,
    'ticketId', target_ticket_id,
    'bookingReference', booking_reference,
    'ticketNumber', generated_ticket_number
  );
end;
$$;

create or replace function public.public_ticket_snapshot(ticket_identifier text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', ticket.id,
    'ticketNumber', ticket.ticket_number,
    'status', ticket.status,
    'validatedAt', ticket.validated_at,
    'approvedAt', case when ticket.status in ('approved','validated') then ticket.updated_at else null end,
    'bookingReference', booking.reference,
    'createdAt', ticket.created_at,
    'eventId', event.id,
    'eventName', event.name,
    'eventBanner', event.banner_path,
    'eventVenue', event.venue,
    'eventDate', event.starts_at,
    'customerName', customer.full_name,
    'packageName', booking.metadata ->> 'packageName',
    'packageAccent', coalesce(booking.metadata ->> 'packageAccent', '#00FF88'),
    'seatLabel', booking.metadata ->> 'seatLabel',
    'benefits', coalesce(booking.metadata -> 'benefits', '[]'::jsonb),
    'amount', booking.total_amount,
    'paymentMethod', booking.metadata ->> 'paymentMethod',
    'declineReason', (select payment.decline_reason from public.payments payment where payment.booking_id = booking.id order by payment.created_at desc limit 1)
  )
  from public.tickets ticket
  join public.bookings booking on booking.id = ticket.booking_id
  join public.events event on event.id = booking.event_id
  join public.customers customer on customer.id = booking.customer_id
  where (ticket.id::text = ticket_identifier or ticket.qr_token::text = ticket_identifier or ticket.ticket_number = ticket_identifier)
    and ticket.deleted_at is null
  limit 1;
$$;

create or replace function public.public_social_proof(target_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'settings', settings.social_proof,
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from public.social_proof_items item
      where item.organization_id = event.organization_id
        and item.visible = true
        and item.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.events event
  join public.settings settings on settings.organization_id = event.organization_id
  where event.id = target_event_id and event.status = 'published' and event.deleted_at is null;
$$;

create or replace function public.create_public_bank_transfer(target_event_id uuid, request_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_result jsonb;
  request_id uuid;
  target_organization_id uuid;
begin
  checkout_result := public.create_public_checkout(target_event_id, request_payload || jsonb_build_object('paymentMethod', 'bank_transfer'));
  select organization_id into target_organization_id from public.events where id = target_event_id;

  insert into public.bank_transfer_requests(
    booking_id,
    organization_id,
    status,
    country,
    currency,
    requested_amount
  ) values (
    (checkout_result ->> 'bookingId')::uuid,
    target_organization_id,
    'waiting_for_bank_details',
    nullif(request_payload ->> 'country', ''),
    coalesce(nullif(request_payload ->> 'currency', ''), 'USD'),
    greatest(coalesce((request_payload ->> 'amount')::numeric, 0), 0)
  ) returning id into request_id;

  insert into public.notifications(organization_id, type, payload)
  values (target_organization_id, 'bank_request', jsonb_build_object(
    'requestId', request_id,
    'bookingId', checkout_result ->> 'bookingId',
    'customerName', request_payload ->> 'customerName'
  ));

  return checkout_result || jsonb_build_object('bankRequestId', request_id);
end;
$$;

create or replace function public.public_bank_transfer_snapshot(request_identifier uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', request.id,
    'bookingId', request.booking_id,
    'status', request.status,
    'bankName', request.bank_name,
    'accountHolder', request.account_holder,
    'accountNumber', request.account_number,
    'routingNumber', request.routing_number,
    'referenceNumber', request.transfer_reference,
    'expiresAt', request.expires_at,
    'createdAt', request.created_at
  )
  from public.bank_transfer_requests request
  where request.id = request_identifier and request.deleted_at is null;
$$;

create or replace function public.queue_public_admin_email(target_event_id uuid, email_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_event public.events;
  owner_email text;
  queued_id uuid;
begin
  select * into target_event from public.events where id = target_event_id and status = 'published' and deleted_at is null;
  if target_event.id is null then raise exception 'This event is not available'; end if;
  select users.email into owner_email
  from public.organization_members member
  join auth.users users on users.id = member.user_id
  where member.organization_id = target_event.organization_id
    and member.role = 'owner'
    and member.disabled_at is null
    and member.deleted_at is null
  order by member.created_at limit 1;
  if owner_email is null then raise exception 'The event owner could not be notified'; end if;
  insert into public.email_queue(organization_id, kind, recipient, subject, payload)
  values (
    target_event.organization_id,
    coalesce(email_payload ->> 'kind', 'booking_started'),
    owner_email,
    coalesce(email_payload ->> 'subject', 'Apex Bookings update'),
    coalesce(email_payload -> 'data', '{}'::jsonb) || jsonb_build_object('actionUrl', email_payload ->> 'deepLink')
  ) returning id into queued_id;
  return queued_id;
end;
$$;

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
        'from', case when message.sender_type = 'customer' then 'customer' else 'admin' end,
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

create or replace function public.open_public_support_conversation(target_event_id uuid, customer_email text, customer_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event public.events;
  target_customer_id uuid;
  target_conversation public.support_conversations;
begin
  select * into target_event from public.events where id = target_event_id and status = 'published' and deleted_at is null;
  if target_event.id is null then raise exception 'This event is not available'; end if;
  if customer_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid email address is required'; end if;
  insert into public.customers(full_name, email, metadata)
  values (coalesce(nullif(trim(customer_name), ''), split_part(lower(customer_email), '@', 1)), lower(trim(customer_email)), jsonb_build_object('source', 'public_support'))
  on conflict (email) do update set full_name = coalesce(nullif(excluded.full_name, ''), public.customers.full_name), updated_at = now()
  returning id into target_customer_id;

  select * into target_conversation
  from public.support_conversations conversation
  where conversation.organization_id = target_event.organization_id
    and conversation.event_id = target_event.id
    and conversation.customer_id = target_customer_id
    and conversation.deleted_at is null
  order by conversation.created_at desc limit 1;

  if target_conversation.id is null then
    insert into public.support_conversations(organization_id, event_id, customer_id)
    values (target_event.organization_id, target_event.id, target_customer_id)
    returning * into target_conversation;
    insert into public.notifications(organization_id, type, payload)
    values (target_event.organization_id, 'support_conversation', jsonb_build_object('conversationId', target_conversation.id, 'customerEmail', lower(trim(customer_email))));
  end if;

  return public.public_support_snapshot(target_conversation.access_token);
end;
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
begin
  select * into target_conversation from public.support_conversations where access_token = conversation_access_token and deleted_at is null;
  if target_conversation.id is null then raise exception 'Conversation was not found'; end if;
  if nullif(trim(message_payload ->> 'body'), '') is null and message_payload -> 'attachment' is null then raise exception 'Message content is required'; end if;
  insert into public.chat_messages(conversation_id, sender_type, body, message_type, delivered_at, metadata)
  values (
    target_conversation.id,
    'customer',
    coalesce(message_payload ->> 'body', ''),
    coalesce(nullif(message_payload ->> 'type', ''), 'text'),
    now(),
    jsonb_build_object('attachment', message_payload -> 'attachment', 'replyTo', message_payload -> 'replyTo')
  ) returning * into inserted_message;
  update public.support_conversations set last_activity_at = now() where id = target_conversation.id;
  insert into public.notifications(organization_id, type, payload)
  values (target_conversation.organization_id, 'support_message', jsonb_build_object('conversationId', target_conversation.id, 'messageId', inserted_message.id));
  return to_jsonb(inserted_message);
end;
$$;

create or replace function public.mark_public_support_read(conversation_access_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_messages message
  set read_at = now()
  where message.conversation_id = (
    select conversation.id from public.support_conversations conversation
    where conversation.access_token = conversation_access_token and conversation.deleted_at is null
  ) and message.sender_type = 'admin' and message.read_at is null;
$$;

create or replace function public.record_public_analytics(target_event_id uuid, analytics_type text, analytics_visitor_id uuid, analytics_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id from public.events where id = target_event_id and status = 'published' and deleted_at is null;
  if target_organization_id is null then return; end if;
  insert into public.analytics_events(organization_id, event_id, visitor_id, event_type, payload)
  values (target_organization_id, target_event_id, analytics_visitor_id, analytics_type, analytics_payload);
end;
$$;

create or replace function public.public_default_booking_template()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select settings.ticket_template -> 'bookingPage'
  from public.settings settings
  join public.organizations organization on organization.id = settings.organization_id
  where organization.deleted_at is null
  order by organization.created_at
  limit 1;
$$;

revoke all on function public.create_public_checkout(uuid, jsonb) from public;
revoke all on function public.public_ticket_snapshot(text) from public;
revoke all on function public.public_social_proof(uuid) from public;
grant execute on function public.create_public_checkout(uuid, jsonb) to anon, authenticated;
grant execute on function public.public_ticket_snapshot(text) to anon, authenticated;
grant execute on function public.public_social_proof(uuid) to anon, authenticated;
revoke all on function public.create_public_bank_transfer(uuid, jsonb) from public;
revoke all on function public.public_bank_transfer_snapshot(uuid) from public;
grant execute on function public.create_public_bank_transfer(uuid, jsonb) to anon, authenticated;
grant execute on function public.public_bank_transfer_snapshot(uuid) to anon, authenticated;
revoke all on function public.queue_public_admin_email(uuid, jsonb) from public;
grant execute on function public.queue_public_admin_email(uuid, jsonb) to anon, authenticated;
revoke all on function public.public_support_snapshot(uuid) from public;
revoke all on function public.open_public_support_conversation(uuid, text, text) from public;
revoke all on function public.send_public_support_message(uuid, jsonb) from public;
revoke all on function public.mark_public_support_read(uuid) from public;
grant execute on function public.public_support_snapshot(uuid) to anon, authenticated;
grant execute on function public.open_public_support_conversation(uuid, text, text) to anon, authenticated;
grant execute on function public.send_public_support_message(uuid, jsonb) to anon, authenticated;
grant execute on function public.mark_public_support_read(uuid) to anon, authenticated;
revoke all on function public.record_public_analytics(uuid, text, uuid, jsonb) from public;
grant execute on function public.record_public_analytics(uuid, text, uuid, jsonb) to anon, authenticated;
revoke all on function public.public_default_booking_template() from public;
grant execute on function public.public_default_booking_template() to anon, authenticated;

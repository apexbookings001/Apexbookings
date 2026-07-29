drop function if exists public.queue_public_admin_email(uuid, jsonb);

create function public.queue_public_admin_email(target_event_id uuid, email_payload jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_event public.events;
  queued_ids uuid[];
begin
  select * into target_event
  from public.events
  where id = target_event_id
    and status = 'published'
    and deleted_at is null;

  if target_event.id is null then raise exception 'This event is not available'; end if;

  with queued as (
    insert into public.email_queue(organization_id, kind, recipient, subject, payload)
    select
      target_event.organization_id,
      coalesce(email_payload ->> 'kind', 'booking_started'),
      users.email,
      coalesce(email_payload ->> 'subject', 'Apex Bookings update'),
      coalesce(email_payload -> 'data', '{}'::jsonb)
        || jsonb_build_object(
          'actionUrl', email_payload ->> 'deepLink',
          'actionLabel', email_payload ->> 'actionLabel',
          'publicAdminNotification', true
        )
    from public.organization_members member
    join auth.users users on users.id = member.user_id
    where member.organization_id = target_event.organization_id
      and member.role in ('owner', 'admin')
      and member.disabled_at is null
      and member.deleted_at is null
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into queued_ids from queued;

  if cardinality(queued_ids) = 0 then raise exception 'No active owner or admin could be notified'; end if;
  return queued_ids;
end;
$$;

grant execute on function public.queue_public_admin_email(uuid, jsonb) to anon, authenticated;

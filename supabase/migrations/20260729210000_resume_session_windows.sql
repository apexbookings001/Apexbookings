-- Versioned Last State / Resume Session support.
-- Event drafts continue to live in events/settings; this table stores only temporary public UI recovery.

create index if not exists session_recovery_expires_at_idx
on public.session_recovery(expires_at)
where deleted_at is null;

create or replace function public.save_public_session_recovery(target_event_id uuid, recovery_token uuid, recovery_state jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_token uuid := coalesce(recovery_token, gen_random_uuid());
  resolved_booking_id uuid := case
    when coalesce(recovery_state ->> 'bookingId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (recovery_state ->> 'bookingId')::uuid
    else null
  end;
begin
  if coalesce((recovery_state ->> 'recoveryVersion')::integer, 0) <> 1 then
    raise exception 'Unsupported recovery state version';
  end if;
  if not exists (select 1 from public.events where id = target_event_id and status = 'published' and deleted_at is null) then
    raise exception 'This event is not available';
  end if;
  if resolved_booking_id is not null and not exists (
    select 1 from public.bookings booking
    where booking.id = resolved_booking_id and booking.event_id = target_event_id
  ) then
    raise exception 'The booking does not belong to this event';
  end if;

  insert into public.session_recovery(access_token, event_id, booking_id, state, email, expires_at, deleted_at)
  values (resolved_token, target_event_id, resolved_booking_id, recovery_state, nullif(recovery_state #>> '{info,email}', ''), now() + interval '10 minutes', null)
  on conflict (access_token) do update set
    booking_id = coalesce(excluded.booking_id, public.session_recovery.booking_id),
    state = excluded.state,
    email = excluded.email,
    expires_at = excluded.expires_at,
    deleted_at = null,
    updated_at = now()
  where public.session_recovery.event_id = target_event_id;
  return resolved_token;
end;
$$;

revoke all on function public.save_public_session_recovery(uuid, uuid, jsonb) from public;
grant execute on function public.save_public_session_recovery(uuid, uuid, jsonb) to anon, authenticated;

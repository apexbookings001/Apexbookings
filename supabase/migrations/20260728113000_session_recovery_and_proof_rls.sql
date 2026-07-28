-- Follow-up hardening after the auth migration was applied.

drop policy if exists "members can access proofs" on public.payment_proofs;
create policy "members can access proofs"
on public.payment_proofs for select
using (
  exists (
    select 1
    from public.payments payment
    join public.bookings booking on booking.id = payment.booking_id
    join public.events event on event.id = booking.event_id
    where payment.id = payment_id
      and public.is_organization_member(event.organization_id)
  )
);

create or replace function public.save_public_session_recovery(target_event_id uuid, recovery_token uuid, recovery_state jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_token uuid := coalesce(recovery_token, gen_random_uuid());
begin
  if not exists (select 1 from public.events where id = target_event_id and status = 'published' and deleted_at is null) then
    raise exception 'This event is not available';
  end if;
  insert into public.session_recovery(access_token, event_id, state, email, expires_at, deleted_at)
  values (resolved_token, target_event_id, recovery_state, nullif(recovery_state #>> '{info,email}', ''), now() + interval '48 hours', null)
  on conflict (access_token) do update set
    state = excluded.state,
    email = excluded.email,
    expires_at = excluded.expires_at,
    deleted_at = null,
    updated_at = now()
  where public.session_recovery.event_id = target_event_id;
  return resolved_token;
end;
$$;

create or replace function public.load_public_session_recovery(recovery_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select recovery.state
  from public.session_recovery recovery
  where recovery.access_token = recovery_token
    and recovery.expires_at > now()
    and recovery.deleted_at is null;
$$;

create or replace function public.clear_public_session_recovery(recovery_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.session_recovery set deleted_at = now() where access_token = recovery_token;
$$;

revoke all on function public.save_public_session_recovery(uuid, uuid, jsonb) from public;
revoke all on function public.load_public_session_recovery(uuid) from public;
revoke all on function public.clear_public_session_recovery(uuid) from public;
grant execute on function public.save_public_session_recovery(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.load_public_session_recovery(uuid) to anon, authenticated;
grant execute on function public.clear_public_session_recovery(uuid) to anon, authenticated;

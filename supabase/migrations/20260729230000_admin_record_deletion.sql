-- Protected, transactional record removal for Apex Bookings admin tools.
-- Soft deletion is the default; explicit test markers gate permanent cleanup.

alter table public.payment_proofs add column if not exists deleted_at timestamptz;
alter table public.analytics_events add column if not exists deleted_at timestamptz;
alter table public.email_queue add column if not exists deleted_at timestamptz;

alter table public.customers add column if not exists is_test boolean not null default false;
alter table public.bookings add column if not exists is_test boolean not null default false;
alter table public.payments add column if not exists is_test boolean not null default false;
alter table public.notifications add column if not exists is_test boolean not null default false;
alter table public.tickets add column if not exists is_test boolean not null default false;
alter table public.payment_proofs add column if not exists is_test boolean not null default false;
alter table public.bank_transfer_requests add column if not exists is_test boolean not null default false;
alter table public.support_conversations add column if not exists is_test boolean not null default false;
alter table public.chat_messages add column if not exists is_test boolean not null default false;
alter table public.analytics_events add column if not exists is_test boolean not null default false;

create index if not exists payment_proofs_active_idx on public.payment_proofs(payment_id) where deleted_at is null;
create index if not exists analytics_active_idx on public.analytics_events(organization_id, created_at desc) where deleted_at is null;

create or replace function public.admin_soft_delete_record(
  target_type text,
  target_identifier text,
  strong_confirmation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_role text;
  actor_org uuid;
  target_id uuid;
  target_booking uuid;
  target_status text;
begin
  select organization_id, role::text into actor_org, actor_role
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  if actor_org is null or actor_role not in ('owner', 'admin') then
    raise exception 'You do not have permission to delete this record';
  end if;

  if target_type = 'notification' then
    update public.notifications set deleted_at = now()
    where id::text = target_identifier and organization_id = actor_org and deleted_at is null
    returning id into target_id;

  elsif target_type = 'conversation' then
    update public.support_conversations set deleted_at = now(), status = 'closed'
    where id::text = target_identifier and organization_id = actor_org and deleted_at is null
    returning id into target_id;
    update public.chat_messages set deleted_at = now()
    where conversation_id = target_id and deleted_at is null;

  elsif target_type = 'message' then
    update public.chat_messages m set deleted_at = now()
    from public.support_conversations c
    where m.id::text = target_identifier and m.conversation_id = c.id
      and c.organization_id = actor_org and m.deleted_at is null
    returning m.id into target_id;

  elsif target_type = 'payment' then
    select p.id, p.booking_id, p.status::text into target_id, target_booking, target_status
    from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.events e on e.id = b.event_id
    where p.id::text = target_identifier and e.organization_id = actor_org and p.deleted_at is null;
    if target_id is not null and target_status in ('approved', 'completed') and (actor_role <> 'owner' or not strong_confirmation) then
      raise exception 'Approved payments require owner confirmation';
    end if;
    update public.payments set deleted_at = now() where id = target_id;
    update public.payment_proofs set deleted_at = now() where payment_id = target_id and deleted_at is null;
    update public.bank_transfer_requests set deleted_at = now(), status = 'cancelled' where booking_id = target_booking and deleted_at is null;
    update public.tickets set status = 'cancelled' where booking_id = target_booking and status in ('pending','approved');
    update public.bookings set payment_state = 'cancelled', status = 'cancelled' where id = target_booking;

  elsif target_type = 'booking' then
    select b.id, b.status into target_id, target_status
    from public.bookings b join public.events e on e.id = b.event_id
    where (b.id::text = target_identifier or b.reference = target_identifier)
      and e.organization_id = actor_org and b.deleted_at is null;
    if target_id is not null and not exists(select 1 from public.bookings where id = target_id and is_test) and (actor_role <> 'owner' or not strong_confirmation) then
      raise exception 'Non-test bookings require owner confirmation';
    end if;
    update public.payment_proofs pp set deleted_at = now()
    from public.payments p where pp.payment_id = p.id and p.booking_id = target_id and pp.deleted_at is null;
    update public.payments set deleted_at = now() where booking_id = target_id and deleted_at is null;
    update public.bank_transfer_requests set deleted_at = now(), status = 'cancelled' where booking_id = target_id and deleted_at is null;
    update public.tickets set deleted_at = now(), status = 'cancelled' where booking_id = target_id and deleted_at is null;
    update public.email_queue set deleted_at = now() where booking_id = target_id and deleted_at is null;
    update public.session_recovery set deleted_at = now() where booking_id = target_id and deleted_at is null;
    update public.bookings set deleted_at = now(), payment_state = 'cancelled', status = 'cancelled' where id = target_id;

  elsif target_type = 'bank_transfer' then
    update public.bank_transfer_requests set deleted_at = now(), status = 'cancelled'
    where id::text = target_identifier and organization_id = actor_org and deleted_at is null returning id into target_id;

  elsif target_type = 'ticket' then
    update public.tickets t set deleted_at = now(), status = 'cancelled'
    from public.bookings b join public.events e on e.id = b.event_id
    where t.id::text = target_identifier and t.booking_id = b.id and e.organization_id = actor_org and t.deleted_at is null
    returning t.id into target_id;

  elsif target_type = 'payment_proof' then
    update public.payment_proofs pp set deleted_at = now()
    from public.payments p join public.bookings b on b.id = p.booking_id join public.events e on e.id = b.event_id
    where pp.id::text = target_identifier and pp.payment_id = p.id and e.organization_id = actor_org and pp.deleted_at is null
    returning pp.id into target_id;

  elsif target_type = 'customer' then
    select c.id into target_id from public.customers c where (c.id::text = target_identifier or lower(c.email) = lower(target_identifier)) and c.deleted_at is null;
    if exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.customer_id = target_id and e.organization_id = actor_org and b.deleted_at is null)
      or exists(select 1 from public.support_conversations s where s.customer_id = target_id and s.organization_id = actor_org and s.deleted_at is null) then
      raise exception 'Customer has retained bookings or conversations; archive or anonymise instead';
    end if;
    update public.customers set deleted_at = now() where id = target_id;

  elsif target_type = 'analytics' then
    update public.analytics_events set deleted_at = now()
    where id::text = target_identifier and organization_id = actor_org and deleted_at is null returning id into target_id;
  else
    raise exception 'Unsupported record type';
  end if;

  if target_id is null then raise exception 'Record not found or already deleted'; end if;
  return jsonb_build_object('ok', true, 'recordType', target_type, 'identifier', target_identifier);
end;
$$;

create or replace function public.admin_cleanup_test_data(target_categories text[], preview_only boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_role text;
  actor_org uuid;
  result jsonb;
begin
  select organization_id, role::text into actor_org, actor_role from public.organization_members where user_id = auth.uid() limit 1;
  if actor_org is null or actor_role <> 'owner' then raise exception 'Only the owner may clean up test data'; end if;

  select jsonb_build_object(
    'notifications', (select count(*) from public.notifications where organization_id = actor_org and is_test and deleted_at is null),
    'conversations', (select count(*) from public.support_conversations where organization_id = actor_org and is_test and deleted_at is null),
    'payments', (select count(*) from public.payments p join public.bookings b on b.id=p.booking_id join public.events e on e.id=b.event_id where e.organization_id=actor_org and p.is_test and p.deleted_at is null),
    'bookings', (select count(*) from public.bookings b join public.events e on e.id=b.event_id where e.organization_id=actor_org and b.is_test and b.deleted_at is null),
    'analytics', (select count(*) from public.analytics_events where organization_id=actor_org and is_test and deleted_at is null)
  ) into result;
  if preview_only then return result; end if;

  if 'notifications' = any(target_categories) then delete from public.notifications where organization_id=actor_org and is_test; end if;
  if 'conversations' = any(target_categories) then
    delete from public.support_conversations where organization_id=actor_org and is_test;
  end if;
  if 'payments' = any(target_categories) then
    delete from public.payments p using public.bookings b, public.events e where p.booking_id=b.id and b.event_id=e.id and e.organization_id=actor_org and p.is_test;
  end if;
  if 'bookings' = any(target_categories) then
    delete from public.bookings b using public.events e where b.event_id=e.id and e.organization_id=actor_org and b.is_test;
  end if;
  if 'analytics' = any(target_categories) then delete from public.analytics_events where organization_id=actor_org and is_test; end if;
  return result;
end;
$$;

revoke all on function public.admin_soft_delete_record(text,text,boolean) from public;
revoke all on function public.admin_cleanup_test_data(text[],boolean) from public;
grant execute on function public.admin_soft_delete_record(text,text,boolean) to authenticated;
grant execute on function public.admin_cleanup_test_data(text[],boolean) to authenticated;

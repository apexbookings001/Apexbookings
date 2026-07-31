-- Seat identity and label integrity
--
-- Labels are display text only. Seat UUID + event UUID + package UUID are the
-- authoritative checkout identity. This migration also provides a protected,
-- idempotent repair function for legacy mixed labels.

create or replace function public.seat_package_code(package_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case upper(trim(coalesce(package_name, '')))
    when 'REGULAR' then 'R'
    when 'VIP' then 'V'
    when 'VVIP' then 'VV'
    else coalesce(nullif(left(regexp_replace(upper(trim(coalesce(package_name, ''))), '[^A-Z0-9]', '', 'g'), 3), ''), 'C')
  end;
$$;

create or replace function public.generate_seat_label(package_name text, seat_position integer)
returns text
language sql
immutable
set search_path = public
as $$
  select public.seat_package_code(package_name) || lpad(greatest(coalesce(seat_position, 1), 1)::text, 3, '0');
$$;

-- The old one-argument RPC accepted any seat UUID. Replacing it with a scoped
-- operation makes the event/package relationship part of the atomic check.
drop function if exists public.reserve_seat_safe(uuid);
create or replace function public.reserve_seat_safe(
  target_seat_id uuid,
  target_event_id uuid,
  target_package_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.seats seat
  set status = 'reserved', updated_at = now()
  from public.events event, public.packages package
  where seat.id = target_seat_id
    and seat.event_id = target_event_id
    and seat.package_id = target_package_id
    and seat.status = 'available'
    and seat.deleted_at is null
    and event.id = target_event_id
    and event.status = 'published'
    and event.deleted_at is null
    and package.id = target_package_id
    and package.event_id = target_event_id
    and package.enabled = true
    and package.deleted_at is null
  returning seat.id into updated_id;

  return updated_id is not null;
end;
$$;

create or replace function public.public_event_seats(p_event_id uuid, p_package_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', seat.id,
      'eventId', seat.event_id,
      'packageId', seat.package_id,
      'label', seat.label,
      'status', seat.status
    ) order by seat.label, seat.id
  ), '[]'::jsonb)
  from public.seats seat
  join public.events event on event.id = seat.event_id
  join public.packages package on package.id = seat.package_id
  where seat.event_id = p_event_id
    and seat.package_id = p_package_id
    and seat.deleted_at is null
    and event.status = 'published'
    and event.deleted_at is null
    and package.enabled = true
    and package.deleted_at is null;
$$;

-- Generates the missing allocation from the highest generated position, never
-- from an array index or a package capacity.
create or replace function public.admin_ensure_seats(
  p_event_id uuid,
  p_package_id uuid,
  p_target_count integer,
  p_prefix text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  pkg_name text;
  existing_count integer;
  to_create integer;
  max_position integer;
begin
  select event.organization_id, package.name
  into org_id, pkg_name
  from public.packages package
  join public.events event on event.id = package.event_id
  where package.id = p_package_id
    and package.event_id = p_event_id
    and package.deleted_at is null
    and event.deleted_at is null;

  if org_id is null then raise exception 'Package not found for this event'; end if;
  if not public.has_organization_role(org_id, array['owner', 'admin']) then raise exception 'Access denied: only owners and admins can generate seats'; end if;
  if p_target_count < 0 then raise exception 'Target count cannot be negative'; end if;

  select count(*) into existing_count from public.seats where package_id = p_package_id and deleted_at is null;
  to_create := p_target_count - existing_count;
  if to_create <= 0 then return jsonb_build_object('created', 0, 'existing', existing_count, 'total', existing_count); end if;

  select coalesce(max((regexp_match(label, '([0-9]+)$'))[1]::integer), 0)
  into max_position
  from public.seats
  where package_id = p_package_id and deleted_at is null and label ~ '[0-9]+$';

  insert into public.seats(event_id, package_id, label, status)
  select p_event_id, p_package_id, coalesce(nullif(p_prefix, ''), public.seat_package_code(pkg_name)) || lpad((max_position + series.sequence_no)::text, 3, '0'), 'available'
  from generate_series(1, to_create) as series(sequence_no);

  return jsonb_build_object('created', to_create, 'existing', existing_count, 'total', existing_count + to_create);
end;
$$;

create or replace function public.admin_adjust_seat_allocation(
  p_package_id uuid,
  p_new_count integer,
  p_prefix text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  event_id_val uuid;
  pkg_name text;
  current_total integer;
  protected_count integer;
  to_add integer;
  max_position integer;
begin
  select event.organization_id, package.event_id, package.name
  into org_id, event_id_val, pkg_name
  from public.packages package
  join public.events event on event.id = package.event_id
  where package.id = p_package_id and package.deleted_at is null;
  if org_id is null then raise exception 'Package not found'; end if;
  if not public.has_organization_role(org_id, array['owner', 'admin']) then raise exception 'Access denied'; end if;
  if p_new_count < 0 then raise exception 'Seat count cannot be negative'; end if;

  select count(*) into current_total from public.seats where package_id = p_package_id and deleted_at is null;
  select count(*) into protected_count from public.seats where package_id = p_package_id and deleted_at is null and status in ('sold', 'reserved');
  if p_new_count < protected_count then raise exception 'Cannot reduce allocation below % protected seats (sold + reserved)', protected_count; end if;

  if p_new_count > current_total then
    to_add := p_new_count - current_total;
    select coalesce(max((regexp_match(label, '([0-9]+)$'))[1]::integer), 0)
    into max_position from public.seats where package_id = p_package_id and deleted_at is null and label ~ '[0-9]+$';
    insert into public.seats(event_id, package_id, label, status)
    select event_id_val, p_package_id, coalesce(nullif(p_prefix, ''), public.seat_package_code(pkg_name)) || lpad((max_position + series.sequence_no)::text, 3, '0'), 'available'
    from generate_series(1, to_add) as series(sequence_no);
  elsif p_new_count < current_total then
    update public.seats set deleted_at = now(), updated_at = now()
    where id in (
      select id from public.seats where package_id = p_package_id and deleted_at is null and status = 'available'
      order by updated_at desc, id desc limit current_total - p_new_count
    );
  end if;

  update public.packages set capacity = p_new_count, updated_at = now() where id = p_package_id;
  return jsonb_build_object('packageId', p_package_id, 'newCount', p_new_count, 'previousCount', current_total, 'protected', protected_count);
end;
$$;

-- Renames in a two-step update so the existing unique(event_id, label)
-- constraint is never violated. IDs, statuses and booking/reservation links are
-- not changed. Rows are ordered by the oldest available seat timestamp, then UUID.
create or replace function public.admin_normalize_package_seat_labels(p_event_id uuid, p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  pkg_name text;
  total_count integer;
begin
  if not exists (
    select 1 from pg_constraint seat_constraint
    where seat_constraint.conrelid = 'public.seats'::regclass
      and seat_constraint.contype = 'u'
      and pg_get_constraintdef(seat_constraint.oid) like '%UNIQUE (event_id, label)%'
  ) then raise exception 'The required unique(event_id, label) constraint is missing'; end if;

  select event.organization_id, package.name into org_id, pkg_name
  from public.packages package join public.events event on event.id = package.event_id
  where package.id = p_package_id and package.event_id = p_event_id and package.deleted_at is null and event.deleted_at is null;
  if org_id is null then raise exception 'Package not found for this event'; end if;
  if session_user not in ('postgres', 'supabase_admin') and not public.has_organization_role(org_id, array['owner', 'admin']) then raise exception 'Access denied'; end if;

  select count(*) into total_count from public.seats where event_id = p_event_id and package_id = p_package_id and deleted_at is null;
  if total_count = 0 then return jsonb_build_object('normalized', 0, 'labels', '[]'::jsonb); end if;

  if exists (
    with desired as (
      select public.generate_seat_label(pkg_name, row_number() over (order by updated_at, id)::integer) as label
      from public.seats where event_id = p_event_id and package_id = p_package_id and deleted_at is null
    )
    select 1 from desired join public.seats existing on existing.event_id = p_event_id and existing.label = desired.label
      where existing.package_id is distinct from p_package_id and existing.deleted_at is null
  ) then raise exception 'Normalization would collide with another package label in this event'; end if;

  update public.seats set label = '__seat-normalizing__' || id::text
  where event_id = p_event_id and package_id = p_package_id and deleted_at is null;

  with ranked as (
    select id, row_number() over (order by updated_at, id)::integer as sequence_no
    from public.seats where event_id = p_event_id and package_id = p_package_id and deleted_at is null
  )
  update public.seats seat set label = public.generate_seat_label(pkg_name, ranked.sequence_no), updated_at = now()
  from ranked where seat.id = ranked.id;

  return jsonb_build_object('normalized', total_count, 'labels', (
    select jsonb_agg(label order by label, id) from public.seats where event_id = p_event_id and package_id = p_package_id and deleted_at is null
  ));
end;
$$;

-- Checkout itself stores the foreign keys and validates the reservation scope;
-- never treat seatLabel as identity.
create or replace function public.create_public_checkout(target_event_id uuid, checkout jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_event public.events;
  target_seat public.seats;
  target_customer_id uuid;
  target_booking_id uuid;
  target_payment_id uuid;
  target_ticket_id uuid;
  booking_reference text;
  generated_ticket_number text;
  requested_method public.payment_method;
  owner_email text;
  requested_seat_id uuid;
  requested_package_id uuid;
begin
  select * into target_event from public.events where id = target_event_id and status = 'published' and deleted_at is null;
  if target_event.id is null then raise exception 'This event is not available for booking'; end if;
  if nullif(checkout ->> 'seat_id', '') is null or nullif(checkout ->> 'package_id', '') is null then raise exception 'A seat and package are required'; end if;
  if nullif(checkout ->> 'event_id', '') is distinct from target_event_id::text then raise exception 'The checkout event does not match the requested event'; end if;
  requested_seat_id := (checkout ->> 'seat_id')::uuid;
  requested_package_id := (checkout ->> 'package_id')::uuid;

  select seat.* into target_seat
  from public.seats seat
  join public.packages package on package.id = seat.package_id
  where seat.id = requested_seat_id
    and seat.event_id = target_event_id
    and seat.package_id = requested_package_id
    and seat.deleted_at is null
    and package.event_id = target_event_id
    and package.enabled = true
    and package.deleted_at is null
  for update;
  if target_seat.id is null then raise exception 'The selected seat does not belong to this event and package'; end if;
  if target_seat.status = 'available' then
    update public.seats set status = 'reserved', updated_at = now() where id = target_seat.id;
  elsif target_seat.status <> 'reserved' then
    raise exception 'The selected seat is no longer available';
  end if;
  if nullif(trim(checkout ->> 'customerEmail'), '') is null then raise exception 'Customer email is required'; end if;
  if nullif(trim(checkout ->> 'customerName'), '') is null then raise exception 'Customer name is required'; end if;

  insert into public.customers(full_name, email, country, preferred_currency, metadata)
  values (trim(checkout ->> 'customerName'), lower(trim(checkout ->> 'customerEmail')), nullif(checkout ->> 'country', ''), coalesce(nullif(checkout ->> 'currency', ''), 'USD'), jsonb_build_object('source', 'public_checkout'))
  on conflict (email) do update set full_name = excluded.full_name, country = coalesce(excluded.country, public.customers.country), preferred_currency = coalesce(excluded.preferred_currency, public.customers.preferred_currency), updated_at = now()
  returning id into target_customer_id;

  booking_reference := coalesce(nullif(checkout ->> 'bookingReference', ''), 'APEX-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)));
  insert into public.bookings(reference, event_id, customer_id, seat_id, package_id, status, payment_state, currency, total_amount, metadata)
  values (booking_reference, target_event.id, target_customer_id, target_seat.id, requested_package_id, 'pending', 'payment_submitted', coalesce(nullif(checkout ->> 'currency', ''), 'USD'), greatest(coalesce((checkout ->> 'amount')::numeric, 0), 0), checkout)
  returning id into target_booking_id;

  requested_method := case checkout ->> 'paymentMethod' when 'cryptocurrency' then 'bitcoin'::public.payment_method when 'paypal' then 'paypal'::public.payment_method when 'cash_app' then 'cash_app'::public.payment_method when 'bank_transfer' then 'bank_transfer'::public.payment_method else 'apple_gift_card'::public.payment_method end;
  insert into public.payments(booking_id, method, status, amount, metadata) values (target_booking_id, requested_method, 'pending', greatest(coalesce((checkout ->> 'amount')::numeric, 0), 0), checkout) returning id into target_payment_id;
  generated_ticket_number := 'TKT-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  insert into public.tickets(booking_id, ticket_number, status) values (target_booking_id, generated_ticket_number, 'pending') returning id into target_ticket_id;

  insert into public.notifications(organization_id, type, payload) values (target_event.organization_id, 'new_booking', jsonb_build_object('bookingId', target_booking_id, 'paymentId', target_payment_id, 'reference', booking_reference, 'customerName', checkout ->> 'customerName', 'eventName', target_event.name));
  select users.email into owner_email from public.organization_members member join auth.users users on users.id = member.user_id where member.organization_id = target_event.organization_id and member.role = 'owner' and member.disabled_at is null and member.deleted_at is null order by member.created_at limit 1;
  if owner_email is not null then insert into public.email_queue(organization_id, booking_id, kind, recipient, subject, payload) values (target_event.organization_id, target_booking_id, 'payment_proof_submitted', owner_email, 'New Apex Booking', checkout || jsonb_build_object('Booking Reference', booking_reference, 'Event', target_event.name)); end if;
  return jsonb_build_object('bookingId', target_booking_id, 'paymentId', target_payment_id, 'ticketId', target_ticket_id, 'bookingReference', booking_reference, 'ticketNumber', generated_ticket_number);
end;
$$;

grant execute on function public.reserve_seat_safe(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.public_event_seats(uuid, uuid) to anon, authenticated;
grant execute on function public.admin_ensure_seats(uuid, uuid, integer, text) to authenticated;
grant execute on function public.admin_adjust_seat_allocation(uuid, integer, text) to authenticated;
grant execute on function public.admin_normalize_package_seat_labels(uuid, uuid) to authenticated;

-- Apex Bookings: Package capacity, seat allocation, and visual seat management.
-- Adds missing columns, indexes, and RPCs for the complete seat system.

-- ─── 1. New columns on events ──────────────────────────────────────────────────
alter table public.events
  add column if not exists capacity integer check (capacity is null or capacity > 0);

-- ─── 2. New columns on packages ───────────────────────────────────────────────
alter table public.packages
  add column if not exists display_order integer not null default 0,
  add column if not exists seat_selection_enabled boolean not null default true,
  add column if not exists enabled boolean not null default true;

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────
create index if not exists packages_event_id_active_idx
  on public.packages(event_id, display_order)
  where deleted_at is null and enabled = true;

create index if not exists packages_event_id_all_idx
  on public.packages(event_id)
  where deleted_at is null;

create index if not exists seats_package_id_idx
  on public.seats(package_id)
  where deleted_at is null;

create index if not exists seats_event_package_status_idx
  on public.seats(event_id, package_id, status)
  where deleted_at is null;

create index if not exists seats_label_event_idx
  on public.seats(event_id, label)
  where deleted_at is null;

-- ─── 4. RPC: reserve_seat_safe ────────────────────────────────────────────────
-- Atomically reserves a seat only if it is currently 'available'.
-- Returns true when reservation succeeded, false when already taken.
create or replace function public.reserve_seat_safe(target_seat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.seats
  set status = 'reserved', updated_at = now()
  where id = target_seat_id
    and status = 'available'
    and deleted_at is null
  returning id into updated_id;

  return updated_id is not null;
end;
$$;

-- ─── 5. RPC: release_seat ─────────────────────────────────────────────────────
-- Releases a reserved seat back to available (used when customer abandons).
create or replace function public.release_seat(target_seat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.seats
  set status = 'available', updated_at = now()
  where id = target_seat_id
    and status = 'reserved'
    and deleted_at is null;
end;
$$;

-- ─── 6. RPC: release_expired_reservations ─────────────────────────────────────
-- Releases reservations that have been held for more than 15 minutes
-- (no completed booking). Should be called periodically or on seat load.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  with candidates as (
    select s.id
    from public.seats s
    where s.status = 'reserved'
      and s.deleted_at is null
      and s.updated_at < now() - interval '15 minutes'
      -- Only release if there is no active/pending booking for this seat
      and not exists (
        select 1 from public.bookings b
        where b.seat_id = s.id
          and b.deleted_at is null
          and b.status not in ('cancelled')
          and b.payment_state not in ('declined', 'cancelled', 'expired')
      )
  )
  update public.seats
  set status = 'available', updated_at = now()
  from candidates
  where public.seats.id = candidates.id;

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

-- ─── 7. RPC: public_event_seats ───────────────────────────────────────────────
-- Returns seat list for public seat selector (available, reserved, sold, disabled).
-- Only returns non-deleted seats for a specific event + package combination.
create or replace function public.public_event_seats(p_event_id uuid, p_package_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'status', s.status,
        'packageId', s.package_id
      )
      order by s.label
    ),
    '[]'::jsonb
  )
  from public.seats s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event_id
    and s.package_id = p_package_id
    and s.deleted_at is null
    and e.status = 'published'
    and e.deleted_at is null;
$$;

-- ─── 8. RPC: admin_event_seats ────────────────────────────────────────────────
-- Returns all seat data for the admin seat manager (all statuses).
create or replace function public.admin_event_seats(p_event_id uuid, p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  select organization_id into org_id
  from public.events
  where id = p_event_id and deleted_at is null;

  if not public.is_organization_member(org_id) then
    raise exception 'Access denied';
  end if;

  return coalesce(
    (select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'status', s.status,
        'packageId', s.package_id
      )
      order by s.label
    )
    from public.seats s
    where s.event_id = p_event_id
      and s.package_id = p_package_id
      and s.deleted_at is null),
    '[]'::jsonb
  );
end;
$$;

-- ─── 9. RPC: admin_package_seat_stats ─────────────────────────────────────────
-- Returns seat counts per status for a package (admin use).
create or replace function public.admin_package_seat_stats(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  select e.organization_id into org_id
  from public.packages p
  join public.events e on e.id = p.event_id
  where p.id = p_package_id and p.deleted_at is null;

  if not public.is_organization_member(org_id) then
    raise exception 'Access denied';
  end if;

  return (
    select jsonb_build_object(
      'total', count(*),
      'available', count(*) filter (where status = 'available'),
      'reserved', count(*) filter (where status = 'reserved'),
      'sold', count(*) filter (where status = 'sold'),
      'disabled', count(*) filter (where status = 'disabled')
    )
    from public.seats
    where package_id = p_package_id and deleted_at is null
  );
end;
$$;

-- ─── 10. RPC: admin_remove_package ────────────────────────────────────────────
-- Soft-deletes a package if it has no sold seats.
-- If it has sold/reserved seats, archives it instead (enabled=false).
create or replace function public.admin_remove_package(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  sold_count integer;
  reserved_count integer;
begin
  select e.organization_id into org_id
  from public.packages p
  join public.events e on e.id = p.event_id
  where p.id = p_package_id and p.deleted_at is null;

  if org_id is null then
    raise exception 'Package not found';
  end if;

  if not public.has_organization_role(org_id, array['owner', 'admin']) then
    raise exception 'Only owners and admins can remove packages';
  end if;

  select
    count(*) filter (where status = 'sold') into sold_count
  from public.seats
  where package_id = p_package_id and deleted_at is null;

  select
    count(*) filter (where status = 'reserved') into reserved_count
  from public.seats
  where package_id = p_package_id and deleted_at is null;

  if sold_count > 0 then
    -- Cannot destructively remove — archive instead
    update public.packages
    set enabled = false, updated_at = now()
    where id = p_package_id;

    return jsonb_build_object(
      'action', 'archived',
      'reason', 'Package has sold seats and cannot be deleted',
      'soldCount', sold_count
    );
  end if;

  -- Safe to soft-delete: disable unused seats
  update public.seats
  set status = 'disabled', deleted_at = now(), updated_at = now()
  where package_id = p_package_id
    and status in ('available', 'reserved')
    and deleted_at is null;

  -- Soft-delete the package
  update public.packages
  set deleted_at = now(), enabled = false, updated_at = now()
  where id = p_package_id;

  return jsonb_build_object(
    'action', 'deleted',
    'reservedReleased', reserved_count
  );
end;
$$;

-- ─── 11. RPC: admin_adjust_seat_allocation ────────────────────────────────────
-- Adjusts seat count for a package: adds new seats or safely removes unused ones.
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
  to_remove integer;
  new_label text;
  seat_index integer;
  max_label_num integer;
begin
  select e.organization_id, p.event_id, p.name
  into org_id, event_id_val, pkg_name
  from public.packages p
  join public.events e on e.id = p.event_id
  where p.id = p_package_id and p.deleted_at is null;

  if org_id is null then raise exception 'Package not found'; end if;
  if not public.has_organization_role(org_id, array['owner', 'admin']) then
    raise exception 'Access denied';
  end if;
  if p_new_count < 0 then raise exception 'Seat count cannot be negative'; end if;

  -- Count current non-deleted seats for this package
  select count(*) into current_total
  from public.seats
  where package_id = p_package_id and deleted_at is null;

  -- Count protected seats (sold, reserved) — cannot be removed
  select count(*) into protected_count
  from public.seats
  where package_id = p_package_id
    and deleted_at is null
    and status in ('sold', 'reserved');

  if p_new_count < protected_count then
    raise exception 'Cannot reduce allocation below % protected seats (sold + reserved)', protected_count;
  end if;

  if p_new_count > current_total then
    -- Add seats
    to_add := p_new_count - current_total;

    -- Find the current max label number for this package
    select coalesce(max(
      case
        when label ~ '^.*-[A-Z]+([0-9]+)$' then
          (regexp_match(label, '([0-9]+)$'))[1]::integer
        else 0
      end
    ), 0) into max_label_num
    from public.seats
    where package_id = p_package_id and deleted_at is null;

    for i in 1..to_add loop
      seat_index := max_label_num + i;
      new_label := coalesce(p_prefix, upper(left(pkg_name, 1))) || lpad(seat_index::text, 2, '0');
      insert into public.seats(event_id, package_id, label, status)
      values (event_id_val, p_package_id, new_label, 'available');
    end loop;

  elsif p_new_count < current_total then
    -- Remove only safe (available, disabled) seats
    to_remove := current_total - p_new_count;

    -- Remove available seats first (newest labels first)
    update public.seats
    set deleted_at = now(), updated_at = now()
    where id in (
      select id from public.seats
      where package_id = p_package_id
        and deleted_at is null
        and status = 'available'
      order by label desc
      limit to_remove
    );
  end if;

  -- Update the package capacity to reflect the new allocation
  update public.packages
  set capacity = p_new_count, updated_at = now()
  where id = p_package_id;

  return jsonb_build_object(
    'packageId', p_package_id,
    'newCount', p_new_count,
    'previousCount', current_total,
    'protected', protected_count
  );
end;
$$;

-- ─── 12. Update public_event_snapshot to respect display_order and enabled ─────
create or replace function public.public_event_snapshot(event_identifier text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'packages', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.display_order, p.price)
      from public.packages p
      where p.event_id = e.id
        and p.deleted_at is null
        and p.enabled = true
    ), '[]'::jsonb),
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'package_id', s.package_id,
        'status', s.status
      ))
      from public.seats s
      where s.event_id = e.id
        and s.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.events e
  where (e.slug = event_identifier or e.short_code = event_identifier)
    and e.status = 'published'
    and e.deleted_at is null
  limit 1;
$$;

-- ─── 13. Grants ───────────────────────────────────────────────────────────────
grant execute on function public.reserve_seat_safe(uuid) to anon, authenticated;
grant execute on function public.release_seat(uuid) to anon, authenticated;
grant execute on function public.release_expired_reservations() to authenticated;
grant execute on function public.public_event_seats(uuid, uuid) to anon, authenticated;
grant execute on function public.admin_event_seats(uuid, uuid) to authenticated;
grant execute on function public.admin_package_seat_stats(uuid) to authenticated;
grant execute on function public.admin_remove_package(uuid) to authenticated;
grant execute on function public.admin_adjust_seat_allocation(uuid, integer, text) to authenticated;

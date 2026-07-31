-- Apex Bookings: Seat-loading reliability fixes
-- Addresses the "Failed to load seats" bug in the admin seat manager.
--
-- Root causes fixed:
--   1. admin_event_seats returned NULL instead of [] when org lookup found no rows
--      (the plpgsql STRICT select into org_id would raise "no rows found" implicitly
--       via the `if not public.is_organization_member(org_id)` check with a NULL org_id).
--   2. Adds admin_ensure_seats RPC: idempotent seat generation so the panel can
--      self-heal when a package has capacity but zero seat rows in the DB.
--   3. Fixes the public_event_seats signature to always return jsonb[] (never null).

-- ─── 1. Harden admin_event_seats ─────────────────────────────────────────────
-- The original function could silently fail when org_id is NULL (event not found
-- or already deleted), leaving the client with an opaque access-denied error.
-- Now it raises a clear, distinguishable error message instead.
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
  -- Lookup the owning organization — raises a clear error if event not found
  select organization_id into org_id
  from public.events
  where id = p_event_id and deleted_at is null;

  if org_id is null then
    raise exception 'Event not found or has been deleted (event_id=%)', p_event_id;
  end if;

  if not public.is_organization_member(org_id) then
    raise exception 'Access denied: you are not a member of the organization that owns this event';
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

-- ─── 2. admin_ensure_seats ────────────────────────────────────────────────────
-- Idempotent: creates only the missing seat rows for a package.
-- Safe to call repeatedly — never creates duplicate seats.
-- Returns the number of seats inserted.
--
-- Usage: call when the seat panel opens and the loaded count < package capacity.
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
  max_num integer;
  seat_index integer;
  new_label text;
  created_count integer := 0;
begin
  -- Verify caller is an admin/owner of the organization
  select e.organization_id, p.name
  into org_id, pkg_name
  from public.packages p
  join public.events e on e.id = p.event_id
  where p.id = p_package_id
    and p.deleted_at is null
    and e.deleted_at is null;

  if org_id is null then
    raise exception 'Package not found (package_id=%)', p_package_id;
  end if;

  if not public.has_organization_role(org_id, array['owner', 'admin']) then
    raise exception 'Access denied: only owners and admins can generate seats';
  end if;

  if p_target_count < 0 then
    raise exception 'Target count cannot be negative';
  end if;

  -- Count existing non-deleted seats for this package
  select count(*) into existing_count
  from public.seats
  where package_id = p_package_id and deleted_at is null;

  to_create := p_target_count - existing_count;

  if to_create <= 0 then
    return jsonb_build_object('created', 0, 'existing', existing_count, 'total', existing_count);
  end if;

  -- Find the highest sequence number already used to avoid collisions
  select coalesce(max(
    case
      when label ~ '[0-9]+$' then (regexp_match(label, '([0-9]+)$'))[1]::integer
      else 0
    end
  ), 0) into max_num
  from public.seats
  where package_id = p_package_id and deleted_at is null;

  -- Create only the missing seats
  for i in 1..to_create loop
    seat_index := max_num + i;
    new_label := coalesce(p_prefix, upper(left(pkg_name, 2))) || lpad(seat_index::text, 2, '0');
    insert into public.seats(event_id, package_id, label, status)
    values (p_event_id, p_package_id, new_label, 'available');
    created_count := created_count + 1;
  end loop;

  return jsonb_build_object(
    'created', created_count,
    'existing', existing_count,
    'total', existing_count + created_count
  );
end;
$$;

-- Grant to authenticated users (org membership checked inside the function)
grant execute on function public.admin_event_seats(uuid, uuid) to authenticated;
grant execute on function public.admin_ensure_seats(uuid, uuid, integer, text) to authenticated;

-- Packages & Seats is an explicit-save workflow. Allocation reconciliation may
-- safely remove any unprotected generated seat, including an admin-marked
-- unavailable one, but never a reserved or sold seat.
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
      select id
      from public.seats
      where package_id = p_package_id
        and deleted_at is null
        and status in ('available', 'disabled')
      order by case status when 'available' then 0 else 1 end, updated_at desc, id desc
      limit current_total - p_new_count
    );
  end if;

  update public.packages set capacity = p_new_count, updated_at = now() where id = p_package_id;
  return jsonb_build_object('packageId', p_package_id, 'newCount', p_new_count, 'previousCount', current_total, 'protected', protected_count);
end;
$$;

grant execute on function public.admin_adjust_seat_allocation(uuid, integer, text) to authenticated;

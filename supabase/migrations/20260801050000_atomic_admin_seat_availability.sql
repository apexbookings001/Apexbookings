-- Explicit, all-or-nothing admin availability changes for generated seats.
-- Reserved and sold rows are intentionally ineligible and cause the whole
-- operation to fail rather than partially applying a bulk selection.
create or replace function public.admin_apply_seat_availability(
  p_event_id uuid,
  p_package_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  requested_count integer;
  eligible_count integer;
  updated_count integer;
begin
  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Seat availability changes must be an array.';
  end if;
  requested_count := jsonb_array_length(p_changes);
  if requested_count = 0 then
    raise exception 'Select at least one seat.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as changed(id uuid, status text)
    where changed.status not in ('available', 'disabled')
  ) then
    raise exception 'Only available and disabled are valid admin availability states.';
  end if;
  if requested_count <> (select count(distinct changed.id) from jsonb_to_recordset(p_changes) as changed(id uuid, status text)) then
    raise exception 'Seat selections must be unique.';
  end if;

  select e.organization_id into org_id
  from public.events e
  where e.id = p_event_id and e.deleted_at is null;
  if org_id is null then raise exception 'Event not found.'; end if;
  if not public.has_organization_role(org_id, array['owner', 'admin']) then
    raise exception 'Access denied: only organization owners and admins can update seat availability.';
  end if;

  select count(*) into eligible_count
  from public.seats seat
  join jsonb_to_recordset(p_changes) as changed(id uuid, status text) on changed.id = seat.id
  where seat.event_id = p_event_id
    and seat.package_id = p_package_id
    and seat.deleted_at is null
    and seat.status in ('available', 'disabled');

  if eligible_count <> requested_count then
    raise exception 'One or more selected seats are protected, stale, or outside this package. No seats were changed.';
  end if;

  update public.seats as seat
  set status = changed.status::public.seat_status,
      updated_at = now()
  from jsonb_to_recordset(p_changes) as changed(id uuid, status text)
  where seat.id = changed.id
    and seat.event_id = p_event_id
    and seat.package_id = p_package_id
    and seat.deleted_at is null
    and seat.status in ('available', 'disabled');
  get diagnostics updated_count = row_count;

  if updated_count <> requested_count then
    raise exception 'Seat availability could not be committed for every selected seat.';
  end if;

  return jsonb_build_object('updated', updated_count, 'requested', requested_count);
end;
$$;

grant execute on function public.admin_apply_seat_availability(uuid, uuid, jsonb) to authenticated;

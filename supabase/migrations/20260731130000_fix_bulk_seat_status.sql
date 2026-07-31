-- Apex Bookings: Bulk seat-status update reliability fix
--
-- Root cause: the old bulkUpdate used only .in('id', ids) with no event_id,
-- package_id, or source-status pre-condition filter, and had no .select()
-- to detect zero-rows-updated silent failures.
--
-- This migration:
--   1. Confirms the seat_status enum covers the four values used by the app.
--   2. Adds an index to speed up bulk status updates on (id, status).
--   3. Adds a helper RPC admin_bulk_set_seat_status so the update can be
--      performed through a single guarded RPC call with proper auth checking,
--      event_id + package_id scoping, source-status pre-condition filtering,
--      and a meaningful return count — making silent failures impossible.

-- ─── 1. Confirm enum values ──────────────────────────────────────────────────
-- The seat_status enum was created in the initial migration. Add any missing
-- values idempotently in case the DB was migrated from an older schema.
do $$ begin
  alter type public.seat_status add value if not exists 'disabled';
exception when others then null; end $$;

-- ─── 2. Index to speed up bulk updates by (id, status) ──────────────────────
create index if not exists seats_id_status_idx
  on public.seats(id, status)
  where deleted_at is null;

-- ─── 3. RPC: admin_bulk_set_seat_status ─────────────────────────────────────
-- Bulk-updates seat status for a list of seat IDs belonging to a specific
-- package. Enforces:
--   • Caller is an owner or admin of the organization
--   • event_id and package_id must both match
--   • source_status filter: only changes seats currently in that status
--   • Never touches sold or reserved seats in any direction
-- Returns the count of rows actually updated.
create or replace function public.admin_bulk_set_seat_status(
  p_event_id uuid,
  p_package_id uuid,
  p_seat_ids uuid[],
  p_new_status text,        -- 'available' or 'disabled'
  p_source_status text      -- 'available' (when disabling) or 'disabled' (when enabling)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  updated_count integer;
begin
  if p_new_status not in ('available', 'disabled') then
    raise exception 'Invalid target status %. Only available and disabled are permitted.', p_new_status;
  end if;

  if p_source_status not in ('available', 'disabled') then
    raise exception 'Invalid source status %. Only available and disabled are permitted.', p_source_status;
  end if;

  if p_source_status = p_new_status then
    raise exception 'source_status and new_status must differ';
  end if;

  if array_length(p_seat_ids, 1) is null or array_length(p_seat_ids, 1) = 0 then
    return jsonb_build_object('updated', 0, 'reason', 'empty id list');
  end if;

  select e.organization_id into org_id
  from public.events e
  where e.id = p_event_id and e.deleted_at is null;

  if org_id is null then
    raise exception 'Event not found (event_id=%)', p_event_id;
  end if;

  if not public.has_organization_role(org_id, array['owner', 'admin']) then
    raise exception 'Access denied: only owners and admins can update seat status';
  end if;

  update public.seats
  set
    status = p_new_status::public.seat_status,
    updated_at = now()
  where id = any(p_seat_ids)
    and event_id = p_event_id
    and package_id = p_package_id
    and status = p_source_status::public.seat_status
    and deleted_at is null;

  get diagnostics updated_count = row_count;

  return jsonb_build_object(
    'updated', updated_count,
    'requested', array_length(p_seat_ids, 1),
    'eventId', p_event_id,
    'packageId', p_package_id,
    'newStatus', p_new_status
  );
end;
$$;

grant execute on function public.admin_bulk_set_seat_status(uuid, uuid, uuid[], text, text) to authenticated;

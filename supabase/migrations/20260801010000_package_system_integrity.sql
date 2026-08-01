-- Keep removal safe for every entry point (visual cards or allocation editor).
-- Packages tied to protected seats are archived; only entirely unused packages
-- are soft-deleted with their available seats.
create or replace function public.admin_remove_package(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  sold_count integer;
  reserved_count integer;
  disabled_count integer;
begin
  select event.organization_id into org_id
  from public.packages package join public.events event on event.id = package.event_id
  where package.id = p_package_id and package.deleted_at is null;
  if org_id is null then raise exception 'Package not found'; end if;
  if not public.has_organization_role(org_id, array['owner', 'admin']) then raise exception 'Only owners and admins can remove packages'; end if;

  select count(*) filter (where status = 'sold'), count(*) filter (where status = 'reserved'), count(*) filter (where status = 'disabled')
  into sold_count, reserved_count, disabled_count
  from public.seats where package_id = p_package_id and deleted_at is null;

  if sold_count > 0 or reserved_count > 0 or disabled_count > 0 then
    update public.packages set enabled = false, updated_at = now() where id = p_package_id;
    return jsonb_build_object('action', 'archived', 'soldCount', sold_count, 'reservedCount', reserved_count, 'disabledCount', disabled_count);
  end if;

  update public.seats set deleted_at = now(), updated_at = now()
  where package_id = p_package_id and status = 'available' and deleted_at is null;
  update public.packages set deleted_at = now(), enabled = false, updated_at = now() where id = p_package_id;
  return jsonb_build_object('action', 'deleted');
end;
$$;

-- The public snapshot never returns archived, deleted, or zero-allocation
-- packages. The public page's live seat query supplies the remaining count.
create or replace function public.public_event_snapshot(event_identifier text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'packages', coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order, p.price) from public.packages p where p.event_id = e.id and p.deleted_at is null and p.enabled = true and p.capacity > 0), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'package_id', s.package_id, 'status', s.status)) from public.seats s where s.event_id = e.id and s.deleted_at is null), '[]'::jsonb)
  ) from public.events e where (e.slug = event_identifier or e.short_code = event_identifier) and e.status = 'published' and e.deleted_at is null limit 1;
$$;

grant execute on function public.public_event_snapshot(text) to anon, authenticated;

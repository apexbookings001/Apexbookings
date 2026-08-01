-- Preserve the existing social-proof table while making each public card
-- explicitly attributable to a truthful source.
alter table public.social_proof_items
  add column if not exists event_id uuid references public.events(id) on delete set null,
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists source_type text not null default 'manual_message',
  add column if not exists country text not null default '',
  add column if not exists mobile_visible boolean not null default true,
  add column if not exists desktop_visible boolean not null default true,
  add column if not exists display_order integer not null default 0;

alter table public.social_proof_items
  drop constraint if exists social_proof_items_source_type_check;
alter table public.social_proof_items
  add constraint social_proof_items_source_type_check
  check (source_type in ('verified_booking', 'manual_message', 'demo'));

create index if not exists social_proof_items_public_rotation_idx
  on public.social_proof_items(organization_id, event_id, display_order, created_at desc)
  where deleted_at is null and visible = true;
create unique index if not exists social_proof_items_verified_booking_unique_idx
  on public.social_proof_items(booking_id)
  where booking_id is not null and source_type = 'verified_booking' and deleted_at is null;

-- Only an approved booking can create a verified entry. The display name is
-- derived from the customer record in the database; no email, phone, address,
-- reference, or payment details are copied to public social proof.
create or replace function public.create_verified_social_proof()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  event_record public.events;
  customer_record public.customers;
  settings_record jsonb;
  privacy_mode text;
  display_name text;
  package_name text;
  booking_country text;
begin
  if not ((new.status = 'approved') or (new.payment_state in ('approved', 'completed'))) then
    return new;
  end if;
  if (old.status = 'approved') or (old.payment_state in ('approved', 'completed')) then
    return new;
  end if;

  select e.* into event_record from public.events e where e.id = new.event_id;
  select c.* into customer_record from public.customers c where c.id = new.customer_id;
  if event_record.id is null or customer_record.id is null then return new; end if;
  select social_proof into settings_record from public.settings where organization_id = event_record.organization_id;
  if coalesce((settings_record ->> 'includeVerifiedBookings')::boolean, true) = false then return new; end if;

  privacy_mode := coalesce(settings_record ->> 'privacyMode', 'first_name');
  if privacy_mode = 'anonymous' then
    display_name := 'Guest';
  elsif privacy_mode = 'first_name_last_initial' then
    display_name := split_part(trim(customer_record.full_name), ' ', 1) || case when cardinality(regexp_split_to_array(trim(customer_record.full_name), '\\s+')) > 1 then ' ' || left((regexp_split_to_array(trim(customer_record.full_name), '\\s+'))[2], 1) || '.' else '' end;
  else
    display_name := split_part(trim(customer_record.full_name), ' ', 1);
  end if;

  package_name := coalesce(new.metadata ->> 'packageName', 'Ticket');
  booking_country := coalesce(new.metadata ->> 'country', customer_record.country, '');
  insert into public.social_proof_items (
    organization_id, event_id, booking_id, source_type, name, city, state, country,
    ticket_package, message, visible, mobile_visible, desktop_visible, display_order
  ) values (
    event_record.organization_id, new.event_id, new.id, 'verified_booking', display_name,
    coalesce(new.metadata ->> 'city', ''), '', booking_country, package_name,
    'reserved a ticket.', true, true, true, 0
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists bookings_create_verified_social_proof on public.bookings;
create trigger bookings_create_verified_social_proof
after update of status, payment_state on public.bookings
for each row execute function public.create_verified_social_proof();

-- Public callers receive only the fields required to render a card. Demo
-- records are intentionally excluded from all published event pages.
create or replace function public.public_social_proof(target_event_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', coalesce(settings.social_proof, '{}'::jsonb) || coalesce(event.social_proof_override, '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'avatar_path', item.avatar_path, 'name', item.name,
        'city', item.city, 'state', item.state, 'country', item.country,
        'ticket_package', item.ticket_package, 'message', item.message,
        'duration_seconds', item.duration_seconds, 'animation', item.animation,
        'position', item.position, 'visible', item.visible,
        'mobile_visible', item.mobile_visible, 'desktop_visible', item.desktop_visible,
        'source_type', item.source_type, 'event_id', item.event_id,
        'display_order', item.display_order, 'created_at', item.created_at
      ) order by item.display_order asc, item.created_at desc)
      from public.social_proof_items item
      where item.organization_id = event.organization_id
        and (item.event_id is null or item.event_id = event.id)
        and item.visible = true and item.deleted_at is null
        and item.source_type in ('verified_booking', 'manual_message')
    ), '[]'::jsonb)
  )
  from public.events event
  left join public.settings settings on settings.organization_id = event.organization_id
  where event.id = target_event_id and event.status = 'published' and event.deleted_at is null;
$$;

grant execute on function public.public_social_proof(uuid) to anon, authenticated;

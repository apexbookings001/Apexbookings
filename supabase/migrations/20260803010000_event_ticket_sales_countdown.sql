-- Per-event ticket-sales countdown configuration. Timestamps, rather than a
-- decrementing counter, are the permanent source of truth.
alter table public.events
  add column if not exists countdown_enabled boolean not null default false,
  add column if not exists countdown_mode text not null default 'fixed_deadline',
  add column if not exists countdown_duration_seconds integer,
  add column if not exists countdown_started_at timestamptz,
  add column if not exists countdown_ends_at timestamptz,
  add column if not exists countdown_timezone text not null default 'UTC',
  add column if not exists countdown_renewal_time time not null default '09:00',
  add column if not exists countdown_reset_threshold numeric(4,3) not null default .5,
  add column if not exists countdown_last_reset_at timestamptz,
  add column if not exists countdown_next_reset_at timestamptz;

alter table public.events drop constraint if exists events_countdown_mode_check;
alter table public.events add constraint events_countdown_mode_check check (countdown_mode in ('fixed_deadline', 'rolling_window')) not valid;
alter table public.events drop constraint if exists events_countdown_duration_check;
alter table public.events add constraint events_countdown_duration_check check (countdown_duration_seconds is null or countdown_duration_seconds in (86400,172800,259200,345600,432000,518400,604800,1209600,1814400,2419200,3024000)) not valid;
create index if not exists events_countdown_active_idx on public.events(countdown_enabled, starts_at) where countdown_enabled;

-- A database-level guard prevents a stale tab or crafted request from creating
-- a new booking after sales close. Existing bookings and tickets are untouched.
create or replace function public.enforce_ticket_sales_window()
returns trigger language plpgsql security definer set search_path = public as $$
declare target public.events; close_at timestamptz;
begin
  select * into target from public.events where id = new.event_id;
  if target.id is null then raise exception 'This event is not available for booking'; end if;
  if target.starts_at <= now() then raise exception 'Booking is no longer available because the event has started'; end if;
  if target.countdown_enabled and target.countdown_mode = 'fixed_deadline' then
    close_at := least(coalesce(target.countdown_ends_at, target.starts_at), target.starts_at);
    if close_at <= now() then raise exception 'Ticket sales have closed'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists bookings_enforce_ticket_sales_window on public.bookings;
create trigger bookings_enforce_ticket_sales_window before insert on public.bookings
for each row execute function public.enforce_ticket_sales_window();

-- Explicit reset only. This never runs as a side effect of saving/publishing.
create or replace function public.admin_reset_event_countdown(target_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target public.events; started timestamptz := clock_timestamp(); duration interval;
begin
  select * into target from public.events where id = target_event_id for update;
  if target.id is null or not public.has_organization_role(target.organization_id, array['owner', 'admin']) then raise exception 'Access denied'; end if;
  if not target.countdown_enabled or target.countdown_mode <> 'rolling_window' or target.countdown_duration_seconds is null then raise exception 'Only a configured rolling booking window can be reset'; end if;
  if target.starts_at <= started then raise exception 'Booking is no longer available because the event has started'; end if;
  duration := make_interval(secs => target.countdown_duration_seconds);
  update public.events set
    countdown_started_at = started,
    countdown_ends_at = least(started + duration, starts_at),
    countdown_last_reset_at = started,
    countdown_next_reset_at = case when target.countdown_duration_seconds <= 172800 then started + interval '1 day' else started + duration * .5 end,
    updated_at = started
  where id = target_event_id
  returning * into target;
  return jsonb_build_object('event', to_jsonb(target), 'server_time', started);
end; $$;
grant execute on function public.admin_reset_event_countdown(uuid) to authenticated;

-- Published clients get the authoritative clock alongside their event snapshot.
create or replace function public.public_event_snapshot(event_identifier text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'server_time', now(),
    'packages', coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order, p.price) from public.packages p where p.event_id = e.id and p.deleted_at is null and p.enabled = true and p.capacity > 0), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'package_id', s.package_id, 'status', s.status)) from public.seats s where s.event_id = e.id and s.deleted_at is null), '[]'::jsonb)
  ) from public.events e
  where (e.slug = event_identifier or e.short_code = event_identifier) and e.status = 'published' and e.deleted_at is null
  limit 1;
$$;
grant execute on function public.public_event_snapshot(text) to anon, authenticated;

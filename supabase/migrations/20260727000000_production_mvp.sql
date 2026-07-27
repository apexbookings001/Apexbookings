-- Apex Bookings production MVP. This migration extends the initial prototype
-- schema with a Supabase-first, local-resume-friendly application model.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.organizations add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz;
alter table public.customers add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists country text, add column if not exists preferred_currency text, add column if not exists preferred_language text, add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.events add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists studio jsonb not null default '{}'::jsonb;
alter table public.packages add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz;
alter table public.seats add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz;
alter table public.bookings add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists access_token uuid not null default gen_random_uuid(), add column if not exists currency text not null default 'USD', add column if not exists payment_state text not null default 'pending' check (payment_state in ('pending','awaiting_bank_details','awaiting_payment','payment_submitted','approved','declined','completed','cancelled')), add column if not exists total_amount numeric(12,2) not null default 0, add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists decline_reason text, add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.media add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists is_chat_media boolean not null default false;
alter table public.notifications add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists recipient_user_id uuid references auth.users(id) on delete set null, add column if not exists recipient_email text, add column if not exists delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed','read'));
alter table public.settings add column if not exists updated_at timestamptz not null default now(), add column if not exists deleted_at timestamptz, add column if not exists branding jsonb not null default '{}'::jsonb, add column if not exists notification_settings jsonb not null default '{}'::jsonb, add column if not exists social_proof jsonb not null default '{}'::jsonb, add column if not exists localization jsonb not null default '{}'::jsonb, add column if not exists support_settings jsonb not null default '{}'::jsonb;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  ticket_number text not null unique,
  qr_token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','approved','declined','validated','cancelled')),
  validated_at timestamptz,
  validated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  method text not null check (method in ('apple_gift_card','paypal','cryptocurrency','cash_app','bank_transfer')),
  enabled boolean not null default true,
  is_default boolean not null default false,
  display_order integer not null default 0,
  instructions text not null default '',
  destination text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(organization_id, method)
);

create table if not exists public.crypto_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coin text not null,
  symbol text not null,
  network text not null,
  wallet_address text not null default '',
  label text,
  instructions text,
  enabled boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(organization_id, coin, network)
);

create table if not exists public.bank_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'waiting_for_bank_details' check (status in ('waiting_for_bank_details','bank_details_ready','transfer_window_active','payment_proof_submitted','awaiting_approval','approved','declined','expired','cancelled')),
  country text,
  currency text not null default 'USD',
  requested_amount numeric(12,2) not null default 0,
  bank_name text,
  account_holder text,
  account_number text,
  routing_number text,
  transfer_reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  access_token uuid not null unique default gen_random_uuid(),
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  notes text not null default '',
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','admin','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text','image','video','audio','voice','document','emoji')),
  attachment_media_id uuid references public.media(id) on delete set null,
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  visitor_id uuid,
  country text,
  language text,
  currency text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  conversation_id uuid references public.support_conversations(id) on delete set null,
  kind text not null,
  recipient text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  event_type text not null,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','failed')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_id)
);

create table if not exists public.social_proof_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  city text not null default '',
  state text not null default '',
  avatar_path text,
  ticket_package text not null default '',
  message text not null default '',
  duration_seconds integer not null default 5 check (duration_seconds between 3 and 15),
  animation text not null default 'fade-slide',
  position text not null default 'bottom-left',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.currency_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null,
  rate numeric(20,8) not null check (rate > 0),
  provider text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(base_currency, quote_currency)
);

create table if not exists public.session_recovery (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null unique default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  email text,
  state jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.qr_validations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  validated_by uuid references auth.users(id) on delete set null,
  scanned_at timestamptz not null default now(),
  result text not null check (result in ('valid','already_validated','invalid','cancelled')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists bookings_access_token_idx on public.bookings(access_token);
create index if not exists bookings_event_created_at_idx on public.bookings(event_id, created_at desc) where deleted_at is null;
create index if not exists tickets_qr_token_idx on public.tickets(qr_token) where deleted_at is null;
create index if not exists payments_status_created_at_idx on public.payments(status, created_at desc) where deleted_at is null;
create index if not exists bank_transfer_status_expires_at_idx on public.bank_transfer_requests(status, expires_at) where deleted_at is null;
create index if not exists support_customer_activity_idx on public.support_conversations(customer_id, last_activity_at desc) where deleted_at is null;
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id, created_at) where deleted_at is null;
create index if not exists analytics_event_type_created_idx on public.analytics_events(event_id, event_type, created_at desc);
create index if not exists email_queue_status_created_idx on public.email_queue(status, created_at);
create index if not exists session_recovery_token_idx on public.session_recovery(access_token) where deleted_at is null;

do $$
declare table_name text;
begin
  foreach table_name in array array['organizations','customers','events','packages','seats','bookings','payments','media','notifications','settings','tickets','payment_methods','crypto_wallets','bank_transfer_requests','support_conversations','chat_messages','email_queue','webhook_events','social_proof_items','session_recovery']
  loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s; create trigger set_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', table_name);
  end loop;
end;
$$;

create or replace function public.bootstrap_admin_workspace()
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare org_id uuid;
begin
  if auth.jwt() ->> 'email' <> 'apexbookings001@gmail.com' then
    raise exception 'Only the configured Apex administrator may bootstrap this workspace';
  end if;
  select organization_id into org_id from public.organization_members where user_id = auth.uid() limit 1;
  if org_id is null then
    insert into public.organizations(name) values ('Apex Bookings') returning id into org_id;
    insert into public.organization_members(organization_id, user_id, role) values (org_id, auth.uid(), 'owner');
    insert into public.settings(organization_id) values (org_id) on conflict do nothing;
  end if;
  return org_id;
end;
$$;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.public_event_snapshot(event_identifier text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'packages', coalesce((select jsonb_agg(to_jsonb(p) order by p.price) from public.packages p where p.event_id = e.id and p.deleted_at is null), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'package_id', s.package_id, 'status', s.status)) from public.seats s where s.event_id = e.id and s.deleted_at is null), '[]'::jsonb)
  ) from public.events e where (e.slug = event_identifier or e.short_code = event_identifier) and e.status = 'published' and e.deleted_at is null limit 1;
$$;

create or replace function public.verify_ticket(ticket_qr_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target public.tickets;
begin
  select * into target from public.tickets where qr_token = ticket_qr_token and deleted_at is null;
  if target.id is null then return jsonb_build_object('result','invalid'); end if;
  if target.status = 'validated' then
    insert into public.qr_validations(ticket_id, validated_by, result) values (target.id, auth.uid(), 'already_validated');
    return jsonb_build_object('result','already_validated','ticket_id',target.id);
  end if;
  if target.status <> 'approved' then
    insert into public.qr_validations(ticket_id, validated_by, result) values (target.id, auth.uid(), 'cancelled');
    return jsonb_build_object('result','cancelled','ticket_id',target.id);
  end if;
  update public.tickets set status = 'validated', validated_at = now(), validated_by = auth.uid() where id = target.id;
  insert into public.qr_validations(ticket_id, validated_by, result) values (target.id, auth.uid(), 'valid');
  return jsonb_build_object('result','valid','ticket_id',target.id);
end;
$$;

alter table public.tickets enable row level security;
alter table public.payment_methods enable row level security;
alter table public.crypto_wallets enable row level security;
alter table public.bank_transfer_requests enable row level security;
alter table public.support_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.analytics_events enable row level security;
alter table public.email_queue enable row level security;
alter table public.webhook_events enable row level security;
alter table public.social_proof_items enable row level security;
alter table public.currency_rates enable row level security;
alter table public.session_recovery enable row level security;
alter table public.qr_validations enable row level security;

create policy "members manage tickets" on public.tickets for all using (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.id = booking_id and public.is_organization_member(e.organization_id))) with check (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.id = booking_id and public.is_organization_member(e.organization_id)));
create policy "members manage payment methods" on public.payment_methods for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage crypto wallets" on public.crypto_wallets for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage bank transfers" on public.bank_transfer_requests for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage support conversations" on public.support_conversations for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage chat messages" on public.chat_messages for all using (exists(select 1 from public.support_conversations c where c.id = conversation_id and public.is_organization_member(c.organization_id))) with check (exists(select 1 from public.support_conversations c where c.id = conversation_id and public.is_organization_member(c.organization_id)));
create policy "members read analytics" on public.analytics_events for select using (public.is_organization_member(organization_id));
create policy "members manage email queue" on public.email_queue for all using (organization_id is null or public.is_organization_member(organization_id)) with check (organization_id is null or public.is_organization_member(organization_id));
create policy "members manage webhooks" on public.webhook_events for all using (organization_id is null or public.is_organization_member(organization_id)) with check (organization_id is null or public.is_organization_member(organization_id));
create policy "members manage social proof" on public.social_proof_items for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "authenticated users read currency rates" on public.currency_rates for select to authenticated using (true);
create policy "members manage session recovery" on public.session_recovery for all using (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id))) with check (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id)));
create policy "members read qr validations" on public.qr_validations for select using (exists(select 1 from public.tickets t join public.bookings b on b.id = t.booking_id join public.events e on e.id = b.event_id where t.id = ticket_id and public.is_organization_member(e.organization_id)));

grant execute on function public.bootstrap_admin_workspace() to authenticated;
grant execute on function public.public_event_snapshot(text) to anon, authenticated;
grant execute on function public.verify_ticket(uuid) to authenticated;

alter publication supabase_realtime add table public.support_conversations, public.chat_messages, public.notifications, public.payments, public.bookings;

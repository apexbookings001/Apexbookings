create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','support')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where organization_id = target_organization_id and user_id = auth.uid());
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.events enable row level security;
alter table public.packages enable row level security;
alter table public.seats enable row level security;
alter table public.bookings enable row level security;
alter table public.customers enable row level security;
alter table public.payments enable row level security;
alter table public.media enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;

create policy "members can access organizations" on public.organizations for all using (public.is_organization_member(id)) with check (public.is_organization_member(id));
create policy "members can access memberships" on public.organization_members for select using (user_id = auth.uid());
create policy "members can manage events" on public.events for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can manage event packages" on public.packages for all using (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id))) with check (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id)));
create policy "members can manage event seats" on public.seats for all using (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id))) with check (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id)));
create policy "members can manage media" on public.media for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can manage settings" on public.settings for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can read bookings" on public.bookings for select using (exists(select 1 from public.events e where e.id = event_id and public.is_organization_member(e.organization_id)));
create policy "members can read customers" on public.customers for select using (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.customer_id = customers.id and public.is_organization_member(e.organization_id)));
create policy "members can manage payments" on public.payments for all using (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.id = booking_id and public.is_organization_member(e.organization_id))) with check (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.id = booking_id and public.is_organization_member(e.organization_id)));
create policy "members can access proofs" on public.payment_proofs for select using (exists(select 1 from public.payments p join public.bookings b on b.id = p.booking_id join public.events e on e.id = b.event_id where p.id = payment_id and public.is_organization_member(e.organization_id)));
create policy "members can manage messages" on public.messages for all using (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.id = booking_id and public.is_organization_member(e.organization_id))) with check (exists(select 1 from public.bookings b join public.events e on e.id = b.event_id where b.id = booking_id and public.is_organization_member(e.organization_id)));
create policy "members can access notifications" on public.notifications for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));

insert into storage.buckets (id, name, public) values ('payment-proofs','payment-proofs',false),('event-images','event-images',false),('ticket-assets','ticket-assets',false),('chat-files','chat-files',false) on conflict (id) do nothing;
create policy "members can access organization files" on storage.objects for all using (bucket_id in ('payment-proofs','event-images','ticket-assets','chat-files') and public.is_organization_member((storage.foldername(name))[1]::uuid)) with check (bucket_id in ('payment-proofs','event-images','ticket-assets','chat-files') and public.is_organization_member((storage.foldername(name))[1]::uuid));
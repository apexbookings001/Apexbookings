alter table public.events
  add column if not exists country_code text not null default 'US',
  add column if not exists language_code text not null default 'en-US',
  add column if not exists currency_code text not null default 'USD',
  add column if not exists social_proof_override jsonb not null default '{}'::jsonb;

update public.events
set short_code = 'APX' || upper(substr(md5(id::text || clock_timestamp()::text), 1, 14))
where short_code is null;

create unique index if not exists events_public_short_code_idx
on public.events(short_code)
where deleted_at is null;

create index if not exists events_organization_active_idx
on public.events(organization_id, created_at desc)
where deleted_at is null;

create or replace function public.public_social_proof(target_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'settings', coalesce(settings.social_proof, '{}'::jsonb) || coalesce(event.social_proof_override, '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from public.social_proof_items item
      where item.organization_id = event.organization_id
        and item.visible = true
        and item.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.events event
  join public.settings settings on settings.organization_id = event.organization_id
  where event.id = target_event_id
    and event.status = 'published'
    and event.deleted_at is null;
$$;

revoke all on function public.public_social_proof(uuid) from public;
grant execute on function public.public_social_proof(uuid) to anon, authenticated;

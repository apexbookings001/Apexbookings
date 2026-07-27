-- Event Studio phases 4–6: structured per-event configuration, publication metadata,
-- and reusable media metadata. Storage objects remain in dedicated Supabase buckets.
alter type public.event_status add value if not exists 'published';
alter type public.event_status add value if not exists 'archived';
alter type public.payment_status add value if not exists 'needs_more_information';

alter table public.events
  add column if not exists content jsonb not null default '{}'::jsonb,
  add column if not exists payment_settings jsonb not null default '{}'::jsonb,
  add column if not exists short_code text unique,
  add column if not exists scheduled_for timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.packages
  add column if not exists description text not null default '',
  add column if not exists benefits jsonb not null default '[]'::jsonb,
  add column if not exists badge_color text;

alter table public.media
  add column if not exists category text not null default 'Other',
  add column if not exists original_name text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists usage_count integer not null default 0;

create index if not exists events_status_scheduled_for_idx on public.events(status, scheduled_for);
create index if not exists media_category_created_at_idx on public.media(category, created_at desc);
create unique index if not exists events_short_code_unique_idx on public.events(short_code) where short_code is not null;

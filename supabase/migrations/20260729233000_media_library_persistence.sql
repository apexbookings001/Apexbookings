-- Keep reusable Event Studio media durable, publicly renderable on published pages,
-- and synchronized across authenticated admin devices.

alter table public.media
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists category text not null default 'Other',
  add column if not exists original_name text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists usage_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists is_chat_media boolean not null default false;

drop trigger if exists set_media_updated_at on public.media;
create trigger set_media_updated_at
before update on public.media
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  52428800,
  array[
    'image/avif', 'image/gif', 'image/heic', 'image/heif', 'image/jpeg',
    'image/png', 'image/svg+xml', 'image/webp', 'video/mp4',
    'video/quicktime', 'video/webm', 'video/x-m4v', 'audio/mpeg',
    'audio/mp4', 'audio/wav', 'application/pdf'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists media_organization_event_assets_idx
on public.media (organization_id, created_at desc)
where deleted_at is null and is_chat_media = false;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'media'
  ) then
    alter publication supabase_realtime add table public.media;
  end if;
end;
$$;

-- Keep public event links readable while letting the database settle collisions.
create or replace function public.readable_event_slug(value text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(value, 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYyy')), '[^a-z0-9]+', '-', 'g')), ''), 'event')
$$;

create or replace function public.ensure_readable_event_slug()
returns trigger language plpgsql set search_path = public as $$
declare base text; candidate text; suffix integer := 2;
begin
  base := public.readable_event_slug(coalesce(new.slug, new.name));
  candidate := base;
  while exists (select 1 from public.events where slug = candidate and (new.id is null or id <> new.id)) loop
    candidate := base || '-' || suffix;
    suffix := suffix + 1;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists events_readable_slug_before_write on public.events;
create trigger events_readable_slug_before_write before insert or update of slug on public.events
for each row execute function public.ensure_readable_event_slug();

-- Public social proof must still fall back to safe defaults when an organization
-- has not yet created its settings row.
create or replace function public.public_social_proof(target_event_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', coalesce(settings.social_proof, '{}'::jsonb) || coalesce(event.social_proof_override, '{}'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at desc) from public.social_proof_items item where item.organization_id = event.organization_id and item.visible = true and item.deleted_at is null), '[]'::jsonb)
  )
  from public.events event
  left join public.settings settings on settings.organization_id = event.organization_id
  where event.id = target_event_id and event.status = 'published' and event.deleted_at is null;
$$;

grant execute on function public.public_social_proof(uuid) to anon, authenticated;

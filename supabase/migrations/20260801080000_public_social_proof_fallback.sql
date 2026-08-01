-- A published event with Social Proof enabled may legitimately have no
-- approved booking yet. Return a truthful availability notice in that case so
-- enabling the feature never results in a permanently empty public overlay.
-- This is response-only data: it is not a booking, does not affect analytics,
-- inventory, revenue, or the social_proof_items table.
create or replace function public.public_social_proof(target_event_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with event_context as (
    select
      event.id,
      event.organization_id,
      case
        when event.social_proof_override ? 'enabled'
          then coalesce((event.social_proof_override ->> 'enabled')::boolean, false)
        else coalesce((settings.social_proof ->> 'enabled')::boolean, false)
      end as enabled
    from public.events event
    left join public.settings settings on settings.organization_id = event.organization_id
    where event.id = target_event_id
      and event.status = 'published'
      and event.deleted_at is null
  ), active_items as (
    select
      event_context.id as event_id,
      jsonb_build_object(
        'id', item.id,
        'avatar_path', item.avatar_path,
        'name', item.name,
        'city', item.city,
        'state', item.state,
        'country', item.country,
        'ticket_package', item.ticket_package,
        'message', item.message,
        'duration_seconds', item.duration_seconds,
        'animation', item.animation,
        'position', item.position,
        'visible', item.visible,
        'mobile_visible', item.mobile_visible,
        'desktop_visible', item.desktop_visible,
        'source_type', item.source_type,
        'event_id', item.event_id,
        'display_order', item.display_order,
        'created_at', item.created_at
      ) as card,
      item.display_order,
      item.created_at
    from event_context
    join public.social_proof_items item
      on item.organization_id = event_context.organization_id
      and (item.event_id is null or item.event_id = event_context.id)
      and item.visible = true
      and item.deleted_at is null
      and item.source_type in ('verified_booking', 'manual_message')
  )
  select jsonb_build_object(
    'socialProofEnabled', event_context.enabled,
    'settings', jsonb_build_object('enabled', event_context.enabled),
    'items', coalesce(
      (
        select jsonb_agg(card order by display_order asc, created_at desc)
        from active_items
        where active_items.event_id = event_context.id
      ),
      case when event_context.enabled then jsonb_build_array(jsonb_build_object(
        'id', concat('availability:', event_context.id),
        'name', 'Apex Bookings',
        'city', '',
        'state', '',
        'country', '',
        'ticket_package', '',
        'message', 'Tickets are available for this event.',
        'duration_seconds', 5,
        'animation', 'fade-slide',
        'position', 'bottom-left',
        'visible', true,
        'mobile_visible', true,
        'desktop_visible', true,
        'source_type', 'manual_message',
        'event_id', event_context.id,
        'display_order', 0,
        'created_at', now()
      )) else '[]'::jsonb end
    )
  )
  from event_context;
$$;

grant execute on function public.public_social_proof(uuid) to anon, authenticated;

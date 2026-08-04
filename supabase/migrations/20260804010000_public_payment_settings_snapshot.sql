-- Published events that opt into platform defaults must use the organization
-- payment configuration saved in Admin Settings, rather than browser defaults.
create or replace function public.public_event_snapshot(event_identifier text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'server_time', now(),
    'platform_payment_settings', jsonb_build_object(
      'usePlatformDefaults', true,
      'defaultMethod', coalesce((
        select method.method from public.payment_methods method
        where method.organization_id = e.organization_id
          and method.deleted_at is null
          and method.enabled = true
          and method.is_default = true
        order by method.display_order
        limit 1
      ), (
        select method.method from public.payment_methods method
        where method.organization_id = e.organization_id
          and method.deleted_at is null
          and method.enabled = true
        order by method.display_order
        limit 1
      ), 'apple_gift_card'),
      'methods', coalesce((
        select jsonb_object_agg(method.method, jsonb_build_object(
          'enabled', method.enabled,
          'hidden', false,
          'order', method.display_order,
          'destination', method.destination,
          'instructions', method.instructions
        ))
        from public.payment_methods method
        where method.organization_id = e.organization_id and method.deleted_at is null
      ), '{}'::jsonb),
      'cryptocurrencies', coalesce((
        select jsonb_object_agg(wallet.coin, jsonb_build_object(
          'enabled', wallet.enabled,
          'address', wallet.wallet_address,
          'network', wallet.network,
          'label', wallet.label,
          'instructions', wallet.instructions
        ))
        from public.crypto_wallets wallet
        where wallet.organization_id = e.organization_id and wallet.deleted_at is null
      ), '{}'::jsonb)
    ),
    'packages', coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order, p.price) from public.packages p where p.event_id = e.id and p.deleted_at is null and p.enabled = true and p.capacity > 0), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'package_id', s.package_id, 'status', s.status)) from public.seats s where s.event_id = e.id and s.deleted_at is null), '[]'::jsonb)
  ) from public.events e
  where (e.slug = event_identifier or e.short_code = event_identifier) and e.status = 'published' and e.deleted_at is null
  limit 1;
$$;
grant execute on function public.public_event_snapshot(text) to anon, authenticated;

-- The UI hides disabled methods, and this guard also rejects a crafted public
-- checkout request for a disabled organization or event-level method.
create or replace function public.public_payment_method_enabled(target_event_id uuid, target_method text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce((event.payment_settings ->> 'usePlatformDefaults')::boolean, true) then exists (
      select 1 from public.payment_methods method
      where method.organization_id = event.organization_id
        and method.method = target_method
        and method.enabled = true
        and method.deleted_at is null
    )
    else coalesce((event.payment_settings -> 'methods' -> target_method ->> 'enabled')::boolean, false)
  end
  from public.events event where event.id = target_event_id;
$$;

create or replace function public.enforce_public_payment_method_enabled()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_event_id uuid; requested_method text;
begin
  requested_method := new.metadata ->> 'paymentMethod';
  if requested_method is null then return new; end if;
  select booking.event_id into target_event_id from public.bookings booking where booking.id = new.booking_id;
  if target_event_id is null or not public.public_payment_method_enabled(target_event_id, requested_method) then
    raise exception 'This payment method is not available for this event';
  end if;
  return new;
end; $$;
drop trigger if exists payments_enforce_public_payment_method_enabled on public.payments;
create trigger payments_enforce_public_payment_method_enabled
before insert on public.payments
for each row execute function public.enforce_public_payment_method_enabled();

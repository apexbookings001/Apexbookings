-- Public checkout retry safety and public/admin support synchronization.

create index if not exists bookings_public_checkout_idempotency_idx
  on public.bookings (event_id, (metadata ->> 'idempotency_key'))
  where deleted_at is null and metadata ? 'idempotency_key';

create or replace function public.create_public_checkout(target_event_id uuid, checkout jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_event public.events;
  target_seat public.seats;
  target_customer_id uuid;
  target_booking public.bookings;
  target_payment public.payments;
  target_ticket public.tickets;
  booking_reference text;
  idempotency_key text;
  generated_ticket_number text;
  requested_method public.payment_method;
  owner_email text;
  requested_seat_id uuid;
  requested_package_id uuid;
begin
  select * into target_event from public.events where id = target_event_id and status = 'published' and deleted_at is null;
  if target_event.id is null then raise exception 'This event is not available for booking'; end if;
  if nullif(checkout ->> 'seat_id', '') is null or nullif(checkout ->> 'package_id', '') is null then raise exception 'A seat and package are required'; end if;
  if nullif(checkout ->> 'event_id', '') is distinct from target_event_id::text then raise exception 'The checkout event does not match the requested event'; end if;
  requested_seat_id := (checkout ->> 'seat_id')::uuid;
  requested_package_id := (checkout ->> 'package_id')::uuid;
  booking_reference := coalesce(nullif(checkout ->> 'bookingReference', ''), 'APEX-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)));
  idempotency_key := coalesce(nullif(checkout ->> 'idempotencyKey', ''), nullif(checkout ->> 'idempotency_key', ''), booking_reference);

  -- A repeat request always returns the first checkout. It never creates another payment or ticket.
  select * into target_booking from public.bookings booking
  where booking.event_id = target_event_id and booking.deleted_at is null
    and ((booking.metadata ->> 'idempotency_key') = idempotency_key or booking.reference = booking_reference)
  order by booking.created_at desc limit 1;
  if target_booking.id is not null then
    if target_booking.seat_id is distinct from requested_seat_id or target_booking.package_id is distinct from requested_package_id then
      raise exception 'Checkout conflict: this recovery key belongs to a different seat or package';
    end if;
    select * into target_payment from public.payments where booking_id = target_booking.id and deleted_at is null order by created_at limit 1;
    select * into target_ticket from public.tickets where booking_id = target_booking.id and deleted_at is null order by created_at limit 1;
    if target_payment.id is null or target_ticket.id is null then raise exception 'Existing checkout is incomplete; contact support'; end if;
    return jsonb_build_object('bookingId', target_booking.id, 'paymentId', target_payment.id, 'ticketId', target_ticket.id, 'bookingReference', target_booking.reference, 'ticketNumber', target_ticket.ticket_number, 'restored', true);
  end if;

  select seat.* into target_seat
  from public.seats seat join public.packages package on package.id = seat.package_id
  where seat.id = requested_seat_id and seat.event_id = target_event_id and seat.package_id = requested_package_id
    and seat.deleted_at is null and package.event_id = target_event_id and package.enabled = true and package.deleted_at is null
  for update;
  if target_seat.id is null then raise exception 'The selected seat does not belong to this event and package'; end if;
  if target_seat.status = 'available' then update public.seats set status = 'reserved', updated_at = now() where id = target_seat.id;
  elsif target_seat.status <> 'reserved' then raise exception 'The selected seat is no longer available'; end if;
  if nullif(trim(checkout ->> 'customerEmail'), '') is null then raise exception 'Customer email is required'; end if;
  if nullif(trim(checkout ->> 'customerName'), '') is null then raise exception 'Customer name is required'; end if;

  insert into public.customers(full_name, email, country, preferred_currency, metadata)
  values (trim(checkout ->> 'customerName'), lower(trim(checkout ->> 'customerEmail')), nullif(checkout ->> 'country', ''), coalesce(nullif(checkout ->> 'currency', ''), 'USD'), jsonb_build_object('source', 'public_checkout'))
  on conflict (email) do update set full_name = excluded.full_name, country = coalesce(excluded.country, public.customers.country), preferred_currency = coalesce(excluded.preferred_currency, public.customers.preferred_currency), updated_at = now()
  returning id into target_customer_id;
  insert into public.bookings(reference, event_id, customer_id, seat_id, package_id, status, payment_state, currency, total_amount, metadata)
  values (booking_reference, target_event.id, target_customer_id, target_seat.id, requested_package_id, 'pending', 'payment_submitted', coalesce(nullif(checkout ->> 'currency', ''), 'USD'), greatest(coalesce((checkout ->> 'amount')::numeric, 0), 0), checkout || jsonb_build_object('idempotency_key', idempotency_key))
  returning * into target_booking;
  requested_method := case checkout ->> 'paymentMethod' when 'cryptocurrency' then 'bitcoin'::public.payment_method when 'paypal' then 'paypal'::public.payment_method when 'cash_app' then 'cash_app'::public.payment_method when 'bank_transfer' then 'bank_transfer'::public.payment_method else 'apple_gift_card'::public.payment_method end;
  insert into public.payments(booking_id, method, status, amount, metadata) values (target_booking.id, requested_method, 'pending', greatest(coalesce((checkout ->> 'amount')::numeric, 0), 0), checkout || jsonb_build_object('idempotency_key', idempotency_key)) returning * into target_payment;
  generated_ticket_number := 'TKT-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  insert into public.tickets(booking_id, ticket_number, status) values (target_booking.id, generated_ticket_number, 'pending') returning * into target_ticket;
  insert into public.notifications(organization_id, type, payload) values (target_event.organization_id, 'new_booking', jsonb_build_object('bookingId', target_booking.id, 'paymentId', target_payment.id, 'reference', booking_reference, 'customerName', checkout ->> 'customerName', 'eventName', target_event.name));
  select users.email into owner_email from public.organization_members member join auth.users users on users.id = member.user_id where member.organization_id = target_event.organization_id and member.role = 'owner' and member.disabled_at is null and member.deleted_at is null order by member.created_at limit 1;
  if owner_email is not null then insert into public.email_queue(organization_id, booking_id, kind, recipient, subject, payload) values (target_event.organization_id, target_booking.id, 'payment_proof_submitted', owner_email, 'New Apex Booking', checkout || jsonb_build_object('Booking Reference', booking_reference, 'Event', target_event.name)); end if;
  return jsonb_build_object('bookingId', target_booking.id, 'paymentId', target_payment.id, 'ticketId', target_ticket.id, 'bookingReference', booking_reference, 'ticketNumber', generated_ticket_number, 'restored', false);
end;
$$;

create or replace function public.open_public_support_conversation(target_event_id uuid, customer_email text, customer_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event public.events;
  target_customer_id uuid;
  target_conversation public.support_conversations;
  normalized_email text := lower(trim(customer_email));
begin
  select * into target_event from public.events where id = target_event_id and status = 'published' and deleted_at is null;
  if target_event.id is null then raise exception 'This event is not available'; end if;
  if normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid email address is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_event_id::text || ':' || normalized_email, 0));
  insert into public.customers(full_name, email, metadata)
  values (coalesce(nullif(trim(customer_name), ''), split_part(normalized_email, '@', 1)), normalized_email, jsonb_build_object('source', 'public_support'))
  on conflict (email) do update set full_name = coalesce(nullif(excluded.full_name, ''), public.customers.full_name), updated_at = now()
  returning id into target_customer_id;
  select * into target_conversation from public.support_conversations conversation
  where conversation.organization_id = target_event.organization_id and conversation.event_id = target_event.id and conversation.customer_id = target_customer_id and conversation.deleted_at is null
  order by conversation.created_at desc limit 1;
  if target_conversation.id is null then
    insert into public.support_conversations(organization_id, event_id, customer_id) values (target_event.organization_id, target_event.id, target_customer_id) returning * into target_conversation;
    insert into public.notifications(organization_id, type, payload) values (target_event.organization_id, 'support_conversation', jsonb_build_object('conversationId', target_conversation.id, 'customerEmail', normalized_email));
  end if;
  return public.public_support_snapshot(target_conversation.access_token);
end;
$$;

grant execute on function public.create_public_checkout(uuid, jsonb) to anon, authenticated;
grant execute on function public.open_public_support_conversation(uuid, text, text) to anon, authenticated;

-- Ticket download data must preserve the event's customer-facing time and
-- organizer name. The public ticket record is the same source used by the
-- confirmation download and the ticket link sent by email.
create or replace function public.public_ticket_snapshot(ticket_identifier text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', ticket.id,
    'ticketNumber', ticket.ticket_number,
    'qrToken', ticket.qr_token,
    'status', ticket.status,
    'validatedAt', ticket.validated_at,
    'approvedAt', case when ticket.status in ('approved','validated') then ticket.updated_at else null end,
    'bookingReference', booking.reference,
    'createdAt', ticket.created_at,
    'eventId', event.id,
    'eventName', event.name,
    'eventHost', booking.metadata ->> 'eventHost',
    'eventBanner', event.banner_path,
    'eventVenue', event.venue,
    'eventDate', event.starts_at,
    'eventTime', booking.metadata ->> 'eventTime',
    'eventTimezone', booking.metadata ->> 'eventTimezone',
    'customerName', customer.full_name,
    'packageName', booking.metadata ->> 'packageName',
    'packageAccent', coalesce(booking.metadata ->> 'packageAccent', '#00FF88'),
    'seatLabel', booking.metadata ->> 'seatLabel',
    'benefits', coalesce(booking.metadata -> 'benefits', '[]'::jsonb),
    'amount', booking.total_amount,
    'paymentMethod', booking.metadata ->> 'paymentMethod',
    'declineReason', (select payment.decline_reason from public.payments payment where payment.booking_id = booking.id order by payment.created_at desc limit 1)
  )
  from public.tickets ticket
  join public.bookings booking on booking.id = ticket.booking_id
  join public.events event on event.id = booking.event_id
  join public.customers customer on customer.id = booking.customer_id
  where (ticket.id::text = ticket_identifier or ticket.qr_token::text = ticket_identifier or ticket.ticket_number = ticket_identifier)
    and ticket.deleted_at is null
  limit 1;
$$;

revoke all on function public.public_ticket_snapshot(text) from public;
grant execute on function public.public_ticket_snapshot(text) to anon, authenticated;

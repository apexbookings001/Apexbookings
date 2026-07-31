import { supabase } from '../../lib/supabase'
import type { TicketRecord } from '../../features/bookings/ticketStore'
import type { PaymentReviewRecord } from '../../features/payments/paymentReviewStore'
import type { PaymentMethod } from '../../types/domain'

export type PublicCheckoutInput = {
  eventId: string
  seat_id: string
  package_id: string
  event_id: string
  bookingReference: string
  eventName: string
  eventBanner: string
  eventDate: string
  eventTime: string
  eventVenue: string
  eventHost: string
  customerName: string
  customerEmail: string
  country: string
  currency: string
  packageName: string
  packageAccent: string
  seatLabel: string
  benefits: string[]
  amount: number
  paymentMethod: PaymentMethod
  proofUrls: string[]
}

export async function createPublicCheckout(input: PublicCheckoutInput): Promise<{ ticket: TicketRecord; payment: PaymentReviewRecord; bookingId: string }> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('create_public_checkout', { target_event_id: input.eventId, checkout: input })
  if (error) throw error
  const result = data as { bookingId: string; paymentId: string; ticketId: string; bookingReference: string; ticketNumber: string }
  const createdAt = new Date().toISOString()
  return {
    bookingId: result.bookingId,
    payment: {
      id: result.paymentId,
      reference: result.bookingReference,
      eventId: input.eventId,
      eventName: input.eventName,
      customer: input.customerName,
      email: input.customerEmail,
      method: input.paymentMethod,
      seatLabel: input.seatLabel,
      packageName: input.packageName,
      amount: input.amount,
      status: 'pending',
      createdAt,
      proofUrls: input.proofUrls,
      notes: '',
    },
    ticket: {
      id: result.ticketId,
      ticketNumber: result.ticketNumber,
      bookingReference: result.bookingReference,
      eventId: input.eventId,
      eventName: input.eventName,
      eventBanner: input.eventBanner,
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      eventVenue: input.eventVenue,
      eventHost: input.eventHost,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      packageName: input.packageName,
      packageAccent: input.packageAccent,
      seatLabel: input.seatLabel,
      benefits: input.benefits,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      country: input.country,
      currency: input.currency,
      status: 'pending',
      createdAt,
    },
  }
}

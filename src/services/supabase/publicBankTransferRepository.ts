import { supabase } from '../../lib/supabase'
import type { PublicCheckoutInput } from './publicCheckoutRepository'
import type { BankTransferRequest } from '../../features/payments/bankTransferStore'
import type { PaymentReviewRecord } from '../../features/payments/paymentReviewStore'
import type { TicketRecord } from '../../features/bookings/ticketStore'

export async function createPublicBankTransfer(input: PublicCheckoutInput): Promise<{ request: BankTransferRequest; payment: PaymentReviewRecord; ticket: TicketRecord }> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('create_public_bank_transfer', { target_event_id: input.eventId, request_payload: input })
  if (error) throw error
  const result = data as { bookingId: string; paymentId: string; ticketId: string; bookingReference: string; ticketNumber: string; bankRequestId: string }
  const createdAt = new Date().toISOString()
  return {
    request: { id: result.bankRequestId, bookingId: result.bookingId, eventId: input.eventId, eventName: input.eventName, customerName: input.customerName, customerEmail: input.customerEmail, country: input.country, currency: input.currency, packageName: input.packageName, seatLabel: input.seatLabel, totalAmount: input.amount, createdAt, status: 'waiting_for_bank_details', paymentMethod: 'bank_transfer' },
    payment: { id: result.paymentId, reference: result.bookingReference, eventId: input.eventId, eventName: input.eventName, customer: input.customerName, email: input.customerEmail, method: 'bank_transfer', seatLabel: input.seatLabel, packageName: input.packageName, amount: input.amount, pricing: input.pricing, status: 'pending', createdAt, proofUrls: [], notes: '' },
    ticket: { id: result.ticketId, ticketNumber: result.ticketNumber, bookingReference: result.bookingReference, eventId: input.eventId, eventName: input.eventName, eventBanner: input.eventBanner, eventDate: input.eventDate, eventTime: input.eventTime, eventVenue: input.eventVenue, eventHost: input.eventHost, customerName: input.customerName, customerEmail: input.customerEmail, packageName: input.packageName, packageAccent: input.packageAccent, seatLabel: input.seatLabel, benefits: input.benefits, amount: input.amount, paymentMethod: 'bank_transfer', country: input.country, currency: input.currency, status: 'pending', createdAt },
  }
}

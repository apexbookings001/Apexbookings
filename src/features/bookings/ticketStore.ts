import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type TicketRecord = {
  id: string
  ticketNumber: string
  bookingReference: string
  eventId: string
  eventName: string
  eventBanner: string
  eventDate: string
  eventTime: string
  eventVenue: string
  eventHost: string
  customerName: string
  customerEmail: string
  packageName: string
  packageAccent: string
  seatLabel: string
  benefits: string[]
  amount: number
  paymentMethod: string
  country?: string
  currency?: string
  status: 'pending' | 'approved' | 'declined'
  declineReason?: string
  createdAt: string
  approvedAt?: string
}

const cache = createProtectedMemoryStore<TicketRecord[]>(() => [])

function normalizeStatus(status: unknown): TicketRecord['status'] {
  if (status === 'approved' || status === 'validated') return 'approved'
  if (status === 'declined' || status === 'cancelled') return 'declined'
  return 'pending'
}

function fromPublicSnapshot(row: Record<string, unknown>): TicketRecord {
  const date = row.eventDate ? new Date(String(row.eventDate)) : null
  return {
    id: String(row.id),
    ticketNumber: String(row.ticketNumber ?? ''),
    bookingReference: String(row.bookingReference ?? ''),
    eventId: String(row.eventId ?? ''),
    eventName: String(row.eventName ?? ''),
    eventBanner: String(row.eventBanner ?? ''),
    eventDate: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : String(row.eventDate ?? ''),
    eventTime: date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
    eventVenue: String(row.eventVenue ?? ''),
    eventHost: String(row.eventHost ?? row.eventName ?? ''),
    customerName: String(row.customerName ?? ''),
    customerEmail: String(row.customerEmail ?? ''),
    packageName: String(row.packageName ?? ''),
    packageAccent: String(row.packageAccent ?? '#00FF88'),
    seatLabel: String(row.seatLabel ?? ''),
    benefits: Array.isArray(row.benefits) ? row.benefits.map(String) : [],
    amount: Number(row.amount ?? 0),
    paymentMethod: String(row.paymentMethod ?? ''),
    country: row.country ? String(row.country) : undefined,
    currency: row.currency ? String(row.currency) : undefined,
    status: normalizeStatus(row.status),
    declineReason: row.declineReason ? String(row.declineReason) : undefined,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    approvedAt: row.approvedAt ? String(row.approvedAt) : undefined,
  }
}

function fromAdminRow(row: Record<string, unknown>): TicketRecord {
  const booking = row.bookings as Record<string, unknown>
  const customer = booking.customers as Record<string, unknown>
  const event = booking.events as Record<string, unknown>
  const metadata = (booking.metadata ?? {}) as Record<string, unknown>
  const eventStudio = (event.studio ?? {}) as Record<string, unknown>
  return fromPublicSnapshot({
    id: row.id,
    ticketNumber: row.ticket_number,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.status === 'approved' || row.status === 'validated' ? row.updated_at : undefined,
    declineReason: metadata.declineReason,
    bookingReference: booking.reference,
    eventId: booking.event_id,
    eventName: event.name,
    eventBanner: event.banner_path,
    eventDate: metadata.eventDate ?? event.starts_at,
    eventTime: metadata.eventTime,
    eventVenue: event.venue,
    eventHost: metadata.eventHost ?? eventStudio.title ?? event.name,
    customerName: customer.full_name,
    customerEmail: customer.email,
    packageName: metadata.packageName,
    packageAccent: metadata.packageAccent,
    seatLabel: metadata.seatLabel,
    benefits: metadata.benefits,
    amount: booking.total_amount,
    paymentMethod: metadata.paymentMethod,
    country: metadata.country,
    currency: metadata.currency,
  })
}

async function updateStatus(id: string, status: 'approved' | 'declined', reason = '') {
  if (!supabase) throw new Error('Supabase is not configured.')
  requireOrganizationId()
  const ticketResult = await supabase.from('tickets').update({ status }).eq('id', id).select('booking_id').single()
  if (ticketResult.error) throw ticketResult.error
  const paymentStatus = status === 'approved' ? 'approved' : 'rejected'
  const paymentState = status === 'approved' ? 'approved' : 'declined'
  const [paymentResult, bookingResult] = await Promise.all([
    supabase.from('payments').update({ status: paymentStatus, decline_reason: reason || null }).eq('booking_id', ticketResult.data.booking_id),
    supabase.from('bookings').update({ status, payment_state: paymentState }).eq('id', ticketResult.data.booking_id),
  ])
  if (paymentResult.error) throw paymentResult.error
  if (bookingResult.error) throw bookingResult.error
}

export const ticketStore = {
  list: () => cache.get(),
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  findById: (id: string) => cache.get().find(ticket => ticket.id === id) ?? null,
  findByTicketNumber: (ticketNumber: string) => cache.get().find(ticket => ticket.ticketNumber === ticketNumber) ?? null,
  findByReference: (reference: string) => cache.get().find(ticket => ticket.bookingReference === reference) ?? null,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      requireOrganizationId()
      const { data, error } = await supabase
        .from('tickets')
        .select('id,ticket_number,status,created_at,updated_at,bookings!inner(reference,event_id,total_amount,metadata,customers!inner(full_name,email),events!inner(name,banner_path,venue,starts_at,studio,organization_id))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      const tickets = (data ?? []).map(row => fromAdminRow(row as unknown as Record<string, unknown>))
      cache.set(tickets)
      return tickets
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  findRemote: async (identifier: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.rpc('public_ticket_snapshot', { ticket_identifier: identifier })
    if (error) throw error
    return data && typeof data === 'object' ? fromPublicSnapshot(data as Record<string, unknown>) : null
  },
  acceptRemote: (record: TicketRecord) => cache.set([record, ...cache.get().filter(ticket => ticket.id !== record.id)]),
  create: (input: Omit<TicketRecord, 'id' | 'ticketNumber' | 'createdAt'>) => {
    const record = { ...input, id: crypto.randomUUID(), ticketNumber: '', createdAt: new Date().toISOString() }
    cache.set([record, ...cache.get()])
    return record
  },
  approve: (id: string) => {
    const next = cache.get().map(ticket => ticket.id === id ? { ...ticket, status: 'approved' as const, approvedAt: new Date().toISOString() } : ticket)
    void cache.optimistic(next, () => updateStatus(id, 'approved')).catch(() => undefined)
  },
  decline: (id: string, reason = '') => {
    const next = cache.get().map(ticket => ticket.id === id ? { ...ticket, status: 'declined' as const, declineReason: reason } : ticket)
    void cache.optimistic(next, () => updateStatus(id, 'declined', reason)).catch(() => undefined)
  },
  clear: cache.reset,
}

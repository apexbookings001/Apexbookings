import type { PaymentMethod } from '../../types/domain'
import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type BankTransferStatus = 'waiting_for_bank_details' | 'bank_details_ready' | 'transfer_window_active' | 'payment_proof_submitted' | 'awaiting_approval' | 'approved' | 'declined' | 'expired' | 'cancelled'
export type BankTransferDetails = { bankName: string; accountHolder: string; accountNumber: string; routingNumber?: string; referenceNumber?: string; expiresAt?: string }
export type BankTransferRequest = {
  id: string; bookingId: string; eventId: string; eventName: string; customerName: string; customerEmail: string; country: string; currency: string; packageName: string; seatLabel: string; totalAmount: number; createdAt: string; status: BankTransferStatus; paymentMethod: PaymentMethod; details?: BankTransferDetails
}

const cache = createProtectedMemoryStore<BankTransferRequest[]>(() => [])

function fromRow(row: Record<string, unknown>): BankTransferRequest {
  const booking = (row.bookings ?? {}) as Record<string, unknown>
  const customer = (booking.customers ?? {}) as Record<string, unknown>
  const event = (booking.events ?? {}) as Record<string, unknown>
  const metadata = (booking.metadata ?? {}) as Record<string, unknown>
  const details = row.bank_name || row.account_number ? {
    bankName: String(row.bank_name ?? ''),
    accountHolder: String(row.account_holder ?? ''),
    accountNumber: String(row.account_number ?? ''),
    routingNumber: row.routing_number ? String(row.routing_number) : undefined,
    referenceNumber: row.transfer_reference ? String(row.transfer_reference) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
  } : undefined
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    eventId: String(booking.event_id ?? ''),
    eventName: String(event.name ?? metadata.eventName ?? ''),
    customerName: String(customer.full_name ?? metadata.customerName ?? ''),
    customerEmail: String(customer.email ?? metadata.customerEmail ?? ''),
    country: String(row.country ?? metadata.country ?? ''),
    currency: String(row.currency ?? metadata.currency ?? 'USD'),
    packageName: String(metadata.packageName ?? ''),
    seatLabel: String(metadata.seatLabel ?? ''),
    totalAmount: Number(row.requested_amount ?? booking.total_amount ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    status: String(row.status) as BankTransferStatus,
    paymentMethod: 'bank_transfer',
    details,
  }
}

async function persist(record: BankTransferRequest) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('bank_transfer_requests').update({
    status: record.status,
    bank_name: record.details?.bankName,
    account_holder: record.details?.accountHolder,
    account_number: record.details?.accountNumber,
    routing_number: record.details?.routingNumber,
    transfer_reference: record.details?.referenceNumber,
    expires_at: record.details?.expiresAt,
  }).eq('id', record.id).eq('organization_id', requireOrganizationId())
  if (error) throw error
}

export const bankTransferStore = {
  list: () => cache.get(),
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  find: (id: string | null | undefined) => id ? cache.get().find(record => record.id === id) ?? null : null,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const organizationId = requireOrganizationId()
      const { data, error } = await supabase
        .from('bank_transfer_requests')
        .select('*,bookings!inner(event_id,total_amount,metadata,customers!inner(full_name,email),events!inner(name,organization_id))')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      const records = (data ?? []).map(row => fromRow(row as unknown as Record<string, unknown>))
      cache.set(records)
      return records
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  acceptRemote: (record: BankTransferRequest) => cache.set([record, ...cache.get().filter(item => item.id !== record.id)]),
  refreshPublic: async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const current = bankTransferStore.find(id)
    const { data, error } = await supabase.rpc('public_bank_transfer_snapshot', { request_identifier: id })
    if (error) throw error
    if (!data || typeof data !== 'object') return current
    const row = data as Record<string, unknown>
    const details = row.bankName || row.accountNumber ? { bankName: String(row.bankName ?? ''), accountHolder: String(row.accountHolder ?? ''), accountNumber: String(row.accountNumber ?? ''), routingNumber: row.routingNumber ? String(row.routingNumber) : undefined, referenceNumber: row.referenceNumber ? String(row.referenceNumber) : undefined, expiresAt: row.expiresAt ? String(row.expiresAt) : undefined } : undefined
    const next = current ? { ...current, status: String(row.status) as BankTransferStatus, details } : null
    if (next) bankTransferStore.acceptRemote(next)
    return next
  },
  create: (input: Omit<BankTransferRequest, 'id' | 'createdAt' | 'status' | 'paymentMethod'>) => {
    const request: BankTransferRequest = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'waiting_for_bank_details', paymentMethod: 'bank_transfer' }
    cache.set([request, ...cache.get()])
    return request
  },
  update: (id: string, change: Partial<Omit<BankTransferRequest, 'id' | 'createdAt'>>) => {
    const current = bankTransferStore.find(id)
    if (!current) return null
    const updated = { ...current, ...change }
    void cache.optimistic(cache.get().map(record => record.id === id ? updated : record), () => persist(updated)).catch(() => undefined)
    return updated
  },
  markReady: (id: string, details?: BankTransferDetails) => {
    const current = bankTransferStore.find(id)
    if (!current || !details) return current
    return bankTransferStore.update(id, { status: 'bank_details_ready', details: { ...details, expiresAt: details.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString() } })
  },
  clear: cache.reset,
}

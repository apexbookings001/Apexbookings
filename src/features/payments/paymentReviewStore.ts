import type { PaymentMethod, PaymentStatus } from '../../types/domain'
import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type PaymentReviewRecord = { id: string; reference: string; eventId: string; eventName: string; customer: string; email: string; method: PaymentMethod; seatLabel: string; packageName: string; amount: number; pricing?: Record<string, unknown>; status: PaymentStatus; createdAt: string; expiresAt?: string; proofUrls: string[]; notes: string }
export type PaymentReviewUpdateResult = { ticketId?: string; ticketNumber?: string; qrToken?: string }

const cache = createProtectedMemoryStore<PaymentReviewRecord[]>(() => [])

function fromRow(row: Record<string, unknown>): PaymentReviewRecord {
  const booking = row.bookings as Record<string, unknown>
  const customer = booking.customers as Record<string, unknown>
  const event = booking.events as Record<string, unknown>
  const metadata = ((row.metadata ?? booking.metadata) ?? {}) as Record<string, unknown>
  const proofUrls = Array.isArray(row.signedProofUrls) ? row.signedProofUrls.map(String) : Array.isArray(metadata.proofUrls) ? metadata.proofUrls.map(String) : []
  return {
    id: String(row.id),
    reference: String(booking.reference),
    eventId: String(booking.event_id),
    eventName: String(event.name),
    customer: String(customer.full_name),
    email: String(customer.email),
    method: String(metadata.paymentMethod ?? (row.method === 'bitcoin' ? 'cryptocurrency' : row.method)) as PaymentMethod,
    seatLabel: String(metadata.seatLabel ?? ''),
    packageName: String(metadata.packageName ?? ''),
    amount: Number(row.amount ?? 0),
    pricing: metadata.pricing as Record<string, unknown> | undefined,
    status: String(row.status) as PaymentStatus,
    createdAt: String(row.created_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    proofUrls,
    notes: String(row.decline_reason ?? metadata.notes ?? ''),
  }
}

async function persist(record: PaymentReviewRecord): Promise<PaymentReviewUpdateResult> {
  if (!supabase) throw new Error('Supabase is not configured.')
  requireOrganizationId()
  const { data, error } = await supabase.from('payments').update({
    status: record.status,
    decline_reason: record.status === 'rejected' ? record.notes : null,
    metadata: {
      paymentMethod: record.method,
      seatLabel: record.seatLabel,
      packageName: record.packageName,
      proofUrls: record.proofUrls,
      notes: record.notes,
      pricing: record.pricing,
    },
  }).eq('id', record.id).select('booking_id').single()
  if (error) throw error

  const paymentState = record.status === 'approved' ? 'approved' : record.status === 'rejected' ? 'declined' : 'payment_submitted'
  const bookingResult = await supabase.from('bookings').update({ payment_state: paymentState, status: record.status }).eq('id', data.booking_id)
  if (bookingResult.error) throw bookingResult.error
  if (record.status === 'approved' || record.status === 'rejected') {
    const ticketResult = await supabase.from('tickets').update({ status: record.status === 'approved' ? 'approved' : 'declined' }).eq('booking_id', data.booking_id).select('id,ticket_number,qr_token').single()
    if (ticketResult.error) throw ticketResult.error
    return { ticketId: ticketResult.data.id, ticketNumber: ticketResult.data.ticket_number, qrToken: ticketResult.data.qr_token }
  }
  return {}
}

export const paymentReviewStore = {
  list: () => cache.get(),
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      requireOrganizationId()
      const { data, error } = await supabase
        .from('payments')
        .select('id,method,status,amount,expires_at,decline_reason,metadata,created_at,payment_proofs(media(bucket,path)),bookings!inner(reference,event_id,metadata,customers!inner(full_name,email),events!inner(name,organization_id))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      const records = await Promise.all((data ?? []).map(async row => {
        const proofs = (row.payment_proofs ?? []) as unknown as { media?: { bucket?: string; path?: string } | null }[]
        const signedProofUrls = (await Promise.all(proofs.map(async proof => {
          if (!proof.media?.bucket || !proof.media.path) return null
          const signed = await supabase!.storage.from(proof.media.bucket).createSignedUrl(proof.media.path, 60 * 60)
          return signed.data?.signedUrl ?? null
        }))).filter((url): url is string => Boolean(url))
        return fromRow({ ...(row as unknown as Record<string, unknown>), signedProofUrls })
      }))
      cache.set(records)
      return records
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  acceptRemote: (record: PaymentReviewRecord) => cache.set([record, ...cache.get().filter(payment => payment.id !== record.id)]),
  create: (input: Omit<PaymentReviewRecord, 'id' | 'reference' | 'createdAt' | 'status'>) => {
    const record: PaymentReviewRecord = { ...input, id: crypto.randomUUID(), reference: '', status: 'pending', createdAt: new Date().toISOString() }
    cache.set([record, ...cache.get()])
    return record
  },
  update: (record: PaymentReviewRecord) => {
    const next = cache.get().map(item => item.id === record.id ? record : item)
    void cache.optimistic(next, async () => { await persist(record) }).catch(() => undefined)
  },
  updateAsync: async (record: PaymentReviewRecord) => {
    const result = await persist(record)
    cache.set(cache.get().map(item => item.id === record.id ? record : item))
    return result
  },
  clear: cache.reset,
}

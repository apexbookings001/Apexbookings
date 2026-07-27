import type { PaymentMethod, PaymentStatus } from '../../types/domain'
import { mediaService, type MediaAsset } from '../media/mediaService'
import { requireSupabase } from '../../services/supabase/client'

export type PaymentRecord = { id: string; bookingId: string; method: PaymentMethod; status: PaymentStatus; amount: number; expiresAt?: string }
export const paymentService = {
  async create(bookingId: string, method: PaymentMethod, amount: number): Promise<PaymentRecord> { const expiresAt = method === 'bank_transfer' ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined; const { data, error } = await requireSupabase().from('payments').insert({ booking_id: bookingId, method, amount, expires_at: expiresAt }).select().single(); if (error) throw error; return { id: String(data.id), bookingId: String(data.booking_id), method: data.method as PaymentMethod, status: data.status as PaymentStatus, amount: Number(data.amount), expiresAt: data.expires_at ?? undefined } },
  async attachProof(organizationId: string, paymentId: string, file: File): Promise<MediaAsset> { const asset = await mediaService.upload(organizationId, 'payment-proofs', file); const { error } = await requireSupabase().from('payment_proofs').insert({ payment_id: paymentId, media_id: asset.id }); if (error) throw error; return asset },
  async setStatus(paymentId: string, status: Extract<PaymentStatus, 'approved' | 'rejected'>): Promise<void> { const { error } = await requireSupabase().from('payments').update({ status }).eq('id', paymentId); if (error) throw error },
}
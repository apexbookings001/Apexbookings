import type { PaymentMethod, PaymentStatus } from '../../types/domain'

export type PaymentReviewRecord = { id: string; reference: string; eventId: string; eventName: string; customer: string; email: string; method: PaymentMethod; seatLabel: string; packageName: string; amount: number; status: PaymentStatus; createdAt: string; expiresAt?: string; proofUrls: string[]; notes: string }
const key = 'apex.payment-reviews'
const eventName = 'apex:payment-reviews'
const read = (): PaymentReviewRecord[] => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) as PaymentReviewRecord[] : [] } catch { return [] } }
const write = (records: PaymentReviewRecord[]) => { localStorage.setItem(key, JSON.stringify(records)); window.dispatchEvent(new Event(eventName)) }
export const paymentReviewStore = {
  list: () => read(),
  subscribe: (listener: () => void) => { window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener) },
  create: (input: Omit<PaymentReviewRecord, 'id' | 'reference' | 'createdAt' | 'status'>) => { const record: PaymentReviewRecord = { ...input, id: crypto.randomUUID(), reference: `ABX-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, status: 'pending', createdAt: new Date().toISOString() }; write([record, ...read()]); return record },
  update: (record: PaymentReviewRecord) => write(read().map(item => item.id === record.id ? record : item)),
}

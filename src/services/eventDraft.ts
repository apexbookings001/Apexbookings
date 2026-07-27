import type { EventStatus, PaymentMethod } from '../types/domain'

export interface EventDraft { name: string; venue: string; startsAt: string; totalSeats: number; paymentMethods: PaymentMethod[]; status: EventStatus }
const draftKey = 'apex.event-draft'
export const eventDraftService = {
  save: (draft: EventDraft) => localStorage.setItem(draftKey, JSON.stringify(draft)),
  load: (): EventDraft | null => { const value = localStorage.getItem(draftKey); return value ? JSON.parse(value) as EventDraft : null },
  clear: () => localStorage.removeItem(draftKey),
}
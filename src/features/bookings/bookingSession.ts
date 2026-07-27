import type { PaymentMethod } from '../../types/domain'

export type BookingSession = { eventId: string; packageId?: string; seatId?: string; name?: string; email?: string; method?: PaymentMethod; step: 'package' | 'seat' | 'information' | 'summary' | 'payment'; updatedAt: string }
const key = 'apex.booking-session'
export const bookingSession = {
  load: (eventId: string): BookingSession | null => { try { const value = JSON.parse(localStorage.getItem(`${key}:${eventId}`) ?? 'null') as BookingSession | null; return value && Date.now() - new Date(value.updatedAt).getTime() < 24 * 60 * 60 * 1000 ? value : null } catch { return null } },
  save: (session: Omit<BookingSession, 'updatedAt'>) => localStorage.setItem(`${key}:${session.eventId}`, JSON.stringify({ ...session, updatedAt: new Date().toISOString() })),
  clear: (eventId: string) => localStorage.removeItem(`${key}:${eventId}`),
}

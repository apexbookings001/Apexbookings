// ─── Session Persistence ──────────────────────────────────────────────────────
// Saves and restores the customer's booking progress across refreshes, tab
// closes, and phone locks — scoped to the event so wrong-event restores
// cannot happen.

export type PersistedBookingState = {
  eventId: string
  step: string
  selectedSeat: number | null
  info: { name: string; email: string }
  payMethod: string | null
  selectedCoinId: string | null
  reviewRecordId: string | null
  ticketId: string | null
  bankTransferRequestId?: string | null
  updatedAt: string
}

const PREFIX = 'apex.booking-state.v2'
const TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

export const sessionPersistence = {
  save(state: Omit<PersistedBookingState, 'updatedAt'>): void {
    try {
      const payload: PersistedBookingState = { ...state, updatedAt: new Date().toISOString() }
      localStorage.setItem(`${PREFIX}:${state.eventId}`, JSON.stringify(payload))
    } catch {
      // Storage full or unavailable — fail silently
    }
  },

  load(eventId: string): PersistedBookingState | null {
    try {
      const raw = localStorage.getItem(`${PREFIX}:${eventId}`)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PersistedBookingState
      const age = Date.now() - new Date(parsed.updatedAt).getTime()
      return age < TTL_MS ? parsed : null
    } catch {
      return null
    }
  },

  clear(eventId: string): void {
    try {
      localStorage.removeItem(`${PREFIX}:${eventId}`)
    } catch {
      // noop
    }
  },
}

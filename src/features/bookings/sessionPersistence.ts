import { supabase } from '../../lib/supabase'

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

const PREFIX = 'apex.booking-draft-token.v3'
const memory = new Map<string, PersistedBookingState>()
const queues = new Map<string, Promise<void>>()
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const tokenKey = (eventId: string) => `${PREFIX}:${eventId}`

function readToken(eventId: string) {
  try { return localStorage.getItem(tokenKey(eventId)) } catch { return null }
}

export const sessionPersistence = {
  save(state: Omit<PersistedBookingState, 'updatedAt'>) {
    const payload = { ...state, updatedAt: new Date().toISOString() }
    memory.set(state.eventId, payload)
    if (!supabase || !isUuid(state.eventId)) return
    const previous = queues.get(state.eventId) ?? Promise.resolve()
    const next = previous.then(async () => {
      const { data, error } = await supabase!.rpc('save_public_session_recovery', { target_event_id: state.eventId, recovery_token: readToken(state.eventId), recovery_state: memory.get(state.eventId) })
      if (error) throw error
      if (data) localStorage.setItem(tokenKey(state.eventId), String(data))
    }).catch(error => { window.dispatchEvent(new CustomEvent('apex:data-sync-error', { detail: error instanceof Error ? error.message : 'Booking progress could not be synchronized.' })) })
    queues.set(state.eventId, next)
  },
  load: (eventId: string) => memory.get(eventId) ?? null,
  loadRemote: async (eventId: string) => {
    const local = memory.get(eventId)
    if (local) return local
    const token = readToken(eventId)
    if (!supabase || !token || !isUuid(token)) return null
    const { data, error } = await supabase.rpc('load_public_session_recovery', { recovery_token: token })
    if (error) throw error
    if (!data || typeof data !== 'object') return null
    const state = data as PersistedBookingState
    memory.set(eventId, state)
    return state
  },
  clear(eventId: string) {
    memory.delete(eventId)
    const token = readToken(eventId)
    try { localStorage.removeItem(tokenKey(eventId)) } catch { /* unavailable storage */ }
    if (supabase && token && isUuid(token)) void supabase.rpc('clear_public_session_recovery', { recovery_token: token })
  },
}

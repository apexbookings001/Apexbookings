import { supabase } from '../../lib/supabase'
import { BOOKING_RESUME_WINDOW_MS } from '../recovery/recoveryStorage'

export type PersistedBookingState = {
  recoveryVersion: 1
  eventId: string
  eventSlug?: string
  route: string
  packageIndex: number
  packageId: string
  quantity: number
  step: string
  selectedSeatId: string | null
  info: { name: string; email: string }
  locale?: { country: string; language: string; currency: string }
  payMethod: string | null
  selectedCoinId: string | null
  proofFileNames: string[]
  proofUploadProgress: number
  reviewRecordId: string | null
  bookingId: string | null
  bookingReference: string
  ticketId: string | null
  bankTransferRequestId?: string | null
  declineReason?: string
  scrollPosition: number
  lastActiveAt: number
  expiresAt: number
  updatedAt: string
  savedAt: number
}

// Keep the persisted wire version accepted by the deployed recovery RPC. Old
// label-only payloads are still discarded by the required selectedSeatId and
// savedAt fields below.
const BOOKING_RECOVERY_VERSION = 1

export type BookingRecoveryResult = { status: 'active'; state: PersistedBookingState } | { status: 'expired'; state: PersistedBookingState } | { status: 'missing'; state: null }

const PREFIX = 'apex.booking-recovery.v1'
const memory = new Map<string, PersistedBookingState>()
const queues = new Map<string, Promise<void>>()
const timers = new Map<string, number>()
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const tokenKey = (eventId: string) => `${PREFIX}:token:${eventId}`
const stateKey = (eventId: string) => `${PREFIX}:state:${eventId}`

function readStorage(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* recovery storage is best effort */ }
}

function readToken(eventId: string) { return readStorage(tokenKey(eventId)) }

function validState(value: unknown, eventId: string): value is PersistedBookingState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<PersistedBookingState>
  return state.recoveryVersion === BOOKING_RECOVERY_VERSION
    && state.eventId === eventId
    && typeof state.route === 'string'
    && typeof state.step === 'string'
    && typeof state.packageIndex === 'number'
    && typeof state.bookingReference === 'string'
    && typeof state.expiresAt === 'number'
    && typeof state.savedAt === 'number'
    && (state.selectedSeatId === null || typeof state.selectedSeatId === 'string')
    && Boolean(state.info && typeof state.info.name === 'string' && typeof state.info.email === 'string')
}

function readLocal(eventId: string) {
  const cached = memory.get(eventId)
  if (cached) return cached
  const raw = readStorage(stateKey(eventId))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!validState(parsed, eventId)) return null
    memory.set(eventId, parsed)
    return parsed
  } catch {
    return null
  }
}

function classify(state: PersistedBookingState | null): BookingRecoveryResult {
  if (!state) return { status: 'missing', state: null }
  return Date.now() <= state.expiresAt ? { status: 'active', state } : { status: 'expired', state }
}

async function syncRemote(eventId: string) {
  const payload = memory.get(eventId)
  if (!payload || !supabase || !isUuid(eventId) || !navigator.onLine) return
  const previous = queues.get(eventId) ?? Promise.resolve()
  const next = previous.then(async () => {
    const latest = memory.get(eventId)
    if (!latest) return
    const { data, error } = await supabase!.rpc('save_public_session_recovery', { target_event_id: eventId, recovery_token: readToken(eventId), recovery_state: latest })
    if (error) throw error
    if (data) writeStorage(tokenKey(eventId), String(data))
  }).catch(error => {
    window.dispatchEvent(new CustomEvent('apex:data-sync-error', { detail: error instanceof Error ? error.message : 'Booking progress could not be synchronized.' }))
  })
  queues.set(eventId, next)
  await next
}

export const sessionPersistence = {
  save(state: Omit<PersistedBookingState, 'recoveryVersion' | 'updatedAt' | 'lastActiveAt' | 'expiresAt'>) {
    const now = Date.now()
    const payload: PersistedBookingState = { ...state, recoveryVersion: BOOKING_RECOVERY_VERSION, lastActiveAt: now, expiresAt: now + BOOKING_RESUME_WINDOW_MS, updatedAt: new Date(now).toISOString(), savedAt: now }
    memory.set(state.eventId, payload)
    writeStorage(stateKey(state.eventId), JSON.stringify(payload))
    const current = timers.get(state.eventId)
    if (current) window.clearTimeout(current)
    timers.set(state.eventId, window.setTimeout(() => { timers.delete(state.eventId); void syncRemote(state.eventId) }, 500))
  },
  load: (eventId: string) => classify(readLocal(eventId)),
  loadRemote: async (eventId: string): Promise<BookingRecoveryResult> => {
    const local = classify(readLocal(eventId))
    if (local.status !== 'missing') return local
    const token = readToken(eventId)
    if (!supabase || !token || !isUuid(token)) return local
    const { data, error } = await supabase.rpc('load_public_session_recovery', { recovery_token: token })
    if (error) throw error
    if (!data || typeof data !== 'object' || !validState(data, eventId)) return { status: 'missing', state: null }
    memory.set(eventId, data)
    writeStorage(stateKey(eventId), JSON.stringify(data))
    return classify(data)
  },
  async flush(eventId: string) {
    const timer = timers.get(eventId)
    if (timer) { window.clearTimeout(timer); timers.delete(eventId) }
    await syncRemote(eventId)
  },
  touch(eventId: string) {
    const current = readLocal(eventId)
    if (!current) return
    const now = Date.now()
    const next = { ...current, lastActiveAt: now, expiresAt: now + BOOKING_RESUME_WINDOW_MS, updatedAt: new Date(now).toISOString() }
    memory.set(eventId, next)
    writeStorage(stateKey(eventId), JSON.stringify(next))
  },
  clear(eventId: string) {
    memory.delete(eventId)
    const timer = timers.get(eventId)
    if (timer) window.clearTimeout(timer)
    timers.delete(eventId)
    const token = readToken(eventId)
    try { localStorage.removeItem(tokenKey(eventId)); localStorage.removeItem(stateKey(eventId)) } catch { /* unavailable storage */ }
    if (supabase && token && isUuid(token)) void supabase.rpc('clear_public_session_recovery', { recovery_token: token })
  },
}

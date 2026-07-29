import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type PropsWithChildren, type SetStateAction } from 'react'
import { BOOKING_RESUME_WINDOW_MS, RECOVERY_VERSION } from './recoveryStorage'

type Flusher = () => void | Promise<void>
type BookingRecoveryContextValue = {
  registerFlusher: (key: string, flusher: Flusher) => () => void
  flushNow: () => Promise<void>
  notifyRestored: () => void
  notifyExpired: () => void
  online: boolean
  getUiState: <T,>(key: string) => T | undefined
  setUiState: (key: string, value: unknown) => void
}

type PublicUiRecovery = { recoveryVersion: 1; lastActiveAt: number; expiresAt: number; ui: Record<string, unknown> }
const PUBLIC_UI_KEY = 'apex.public-ui-recovery.v1'

function createPublicUiRecovery(): PublicUiRecovery {
  const now = Date.now()
  return { recoveryVersion: RECOVERY_VERSION, lastActiveAt: now, expiresAt: now + BOOKING_RESUME_WINDOW_MS, ui: {} }
}

function readPublicUiRecovery() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUBLIC_UI_KEY) ?? 'null') as Partial<PublicUiRecovery> | null
    if (parsed?.recoveryVersion !== RECOVERY_VERSION || typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now() || !parsed.ui || typeof parsed.ui !== 'object') return createPublicUiRecovery()
    return parsed as PublicUiRecovery
  } catch { return createPublicUiRecovery() }
}

const BookingRecoveryContext = createContext<BookingRecoveryContextValue | null>(null)

export function BookingSessionRecoveryProvider({ children }: PropsWithChildren) {
  const flushers = useRef(new Map<string, Flusher>())
  const [message, setMessage] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [uiRecovery, setUiRecovery] = useState<PublicUiRecovery>(readPublicUiRecovery)
  const uiRecoveryRef = useRef(uiRecovery)

  const commitUi = useCallback((change: (current: PublicUiRecovery) => PublicUiRecovery) => {
    setUiRecovery(current => {
      const next = change(current)
      uiRecoveryRef.current = next
      try { localStorage.setItem(PUBLIC_UI_KEY, JSON.stringify(next)) } catch { /* temporary UI recovery is best effort */ }
      return next
    })
  }, [])

  const getUiState = useCallback(<T,>(key: string) => uiRecoveryRef.current.ui[key] as T | undefined, [])
  const setUiState = useCallback((key: string, value: unknown) => commitUi(current => {
    const now = Date.now()
    return { ...current, lastActiveAt: now, expiresAt: now + BOOKING_RESUME_WINDOW_MS, ui: { ...current.ui, [key]: value } }
  }), [commitUi])

  const flushNow = useCallback(async () => {
    await Promise.allSettled([...flushers.current.values()].map(flusher => Promise.resolve().then(flusher)))
  }, [])

  const show = useCallback((next: string) => {
    setMessage(next)
    window.setTimeout(() => setMessage(current => current === next ? null : current), 4000)
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushNow()
      else window.dispatchEvent(new CustomEvent('apex:booking-resume-check'))
    }
    const onPageHide = () => void flushNow()
    const onFocus = () => window.dispatchEvent(new CustomEvent('apex:booking-resume-check'))
    const onOnline = () => { setOnline(true); void flushNow() }
    const onOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [flushNow])

  const value = useMemo<BookingRecoveryContextValue>(() => ({
    registerFlusher: (key, flusher) => { flushers.current.set(key, flusher); return () => { flushers.current.delete(key) } },
    flushNow,
    notifyRestored: () => show('Your booking progress has been restored.'),
    notifyExpired: () => show('Booking session expired.'),
    online,
    getUiState,
    setUiState,
  }), [flushNow, getUiState, online, setUiState, show])

  return <BookingRecoveryContext.Provider value={value}>{children}{message && <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[10000] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border border-emerald-400/25 bg-zinc-950 px-4 py-2 text-center text-xs font-semibold text-emerald-200 shadow-2xl">{message}</div>}{!online && <div role="status" className="fixed right-3 top-[max(.75rem,env(safe-area-inset-top))] z-[10000] rounded-full border border-amber-400/25 bg-zinc-950 px-3 py-2 text-[10px] font-bold text-amber-200">Offline — booking progress is kept on this device</div>}</BookingRecoveryContext.Provider>
}

export function useBookingSessionRecovery() {
  const context = useContext(BookingRecoveryContext)
  if (!context) throw new Error('useBookingSessionRecovery must be used within BookingSessionRecoveryProvider')
  return context
}

export function useBookingRecoveryState<T>(key: string, initialValue: T, validate?: (value: unknown) => value is T): [T, Dispatch<SetStateAction<T>>] {
  const { getUiState, setUiState } = useBookingSessionRecovery()
  const recovered = getUiState<T>(key)
  const [value, setValue] = useState<T>(() => recovered !== undefined && (!validate || validate(recovered)) ? recovered : initialValue)
  const previousKey = useRef(key)
  useEffect(() => {
    if (previousKey.current === key) return
    previousKey.current = key
    const next = getUiState<T>(key)
    setValue(next !== undefined && (!validate || validate(next)) ? next : initialValue)
  }, [getUiState, initialValue, key, validate])
  const setRecoveredValue: Dispatch<SetStateAction<T>> = useCallback(next => {
    setValue(current => {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current) : next
      setUiState(key, resolved)
      return resolved
    })
  }, [key, setUiState])
  return [value, setRecoveredValue]
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type PropsWithChildren, type SetStateAction } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useWorkspaceSync } from '../../services/supabase/WorkspaceSyncProvider'
import {
  ADMIN_RESUME_WINDOW_MS,
  clearAdminRecovery,
  createAdminRecoveryState,
  readAdminRecovery,
  writeAdminRecovery,
  type AdminRecoveryState,
} from './recoveryStorage'

export type RecoverySaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'
type Flusher = () => void | Promise<void>

type AdminRecoveryContextValue = {
  state: AdminRecoveryState
  getUiState: <T,>(key: string) => T | undefined
  setUiState: (key: string, value: unknown) => void
  clearUiState: (key: string) => void
  registerFlusher: (key: string, flusher: Flusher) => () => void
  flushNow: () => Promise<void>
  saveStatus: RecoverySaveStatus
  setSaveStatus: Dispatch<SetStateAction<RecoverySaveStatus>>
}

const AdminRecoveryContext = createContext<AdminRecoveryContextValue | null>(null)

function AdminUnlock({ email, busy, error, onUnlock, onStartFresh }: { email: string; busy: boolean; error: string | null; onUnlock: (password: string) => void; onStartFresh: () => void }) {
  const [password, setPassword] = useState('')
  return <main className="grid min-h-screen place-items-center bg-[#09090B] p-5 text-white">
    <section className="w-full max-w-md rounded-3xl border border-emerald-400/20 bg-[#111113] p-7 shadow-2xl">
      <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">Secure session unlock</p>
      <h1 className="mt-2 font-serif text-2xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">Your previous admin location and draft are preserved. Sign in again to continue securely.</p>
      <label className="mt-6 block text-xs text-zinc-400">Account<input value={email} readOnly className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300" /></label>
      <label className="mt-4 block text-xs text-zinc-400">Password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && password) onUnlock(password) }} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400" /></label>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
      <button disabled={busy || !password} onClick={() => onUnlock(password)} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-zinc-950 disabled:opacity-50">{busy ? 'Unlocking…' : 'Sign in and resume'}</button>
      <button type="button" onClick={onStartFresh} className="mt-3 w-full py-2 text-xs text-zinc-500 hover:text-zinc-300">Start fresh on the admin dashboard</button>
    </section>
  </main>
}

export function AdminSessionRecoveryProvider({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, session, signIn, loading } = useAuth()
  const { refetch } = useWorkspaceSync()
  const initialRoute = useRef(`${location.pathname}${location.search}${location.hash}`).current
  const [state, setState] = useState<AdminRecoveryState>(() => createAdminRecoveryState(initialRoute))
  const stateRef = useRef(state)
  const loadedUserId = useRef<string | null>(null)
  const flushers = useRef(new Map<string, Flusher>())
  const hiddenAt = useRef<number | null>(null)
  const restoredOnce = useRef(false)
  const scrollTimer = useRef<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [saveStatus, setSaveStatus] = useState<RecoverySaveStatus>('idle')
  const isAdminRoute = location.pathname.startsWith('/admin') && location.pathname !== '/admin/login'

  const commit = useCallback((change: (current: AdminRecoveryState) => AdminRecoveryState) => {
    setState(current => {
      const next = change(current)
      stateRef.current = next
      writeAdminRecovery(next)
      return next
    })
  }, [])

  const flushNow = useCallback(async () => {
    const tasks = [...flushers.current.values()].map(flusher => Promise.resolve().then(flusher))
    if (!tasks.length) return
    await Promise.allSettled(tasks)
  }, [])

  const getUiState = useCallback(<T,>(key: string) => stateRef.current.ui[key] as T | undefined, [])
  const setUiState = useCallback((key: string, nextValue: unknown) => commit(current => ({ ...current, updatedAt: Date.now(), ui: { ...current.ui, [key]: nextValue } })), [commit])
  const clearUiState = useCallback((key: string) => commit(current => { const ui = { ...current.ui }; delete ui[key]; return { ...current, updatedAt: Date.now(), ui } }), [commit])
  const registerFlusher = useCallback((key: string, flusher: Flusher) => { flushers.current.set(key, flusher); return () => { flushers.current.delete(key) } }, [])

  const capture = useCallback((lastActiveAt = Date.now()) => {
    if (!isAdminRoute) return
    const route = `${location.pathname}${location.search}${location.hash}`
    commit(current => ({
      ...current,
      recoveryVersion: 1,
      userId: user?.id ?? current.userId,
      route,
      lastActiveAt,
      updatedAt: Date.now(),
      scrollPositions: { ...current.scrollPositions, [route]: Math.max(0, Math.round(window.scrollY)) },
    }))
  }, [commit, isAdminRoute, location.hash, location.pathname, location.search, user?.id])

  useEffect(() => {
    if (!user) return
    const recovered = readAdminRecovery(user.id)
    if (recovered) {
      const next = { ...recovered, userId: user.id }
      stateRef.current = next
      setState(next)
      const elapsed = Date.now() - recovered.lastActiveAt
      if (isAdminRoute && elapsed > ADMIN_RESUME_WINDOW_MS) setLocked(true)
    } else {
      const next = { ...createAdminRecoveryState(initialRoute), userId: user.id }
      stateRef.current = next
      setState(next)
      writeAdminRecovery(next)
    }
    loadedUserId.current = user.id
  }, [initialRoute, isAdminRoute, user?.id])

  useEffect(() => {
    if (!isAdminRoute || !session || loading || restoredOnce.current) return
    restoredOnce.current = true
    const recovered = stateRef.current
    const route = `${location.pathname}${location.search}${location.hash}`
    if (route === '/admin' && recovered.route.startsWith('/admin/') && recovered.route !== '/admin/login') navigate(recovered.route, { replace: true })
    const position = recovered.scrollPositions[recovered.route]
    if (typeof position === 'number') window.setTimeout(() => window.scrollTo({ top: Math.min(position, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)), behavior: 'auto' }), 120)
  }, [isAdminRoute, loading, location.hash, location.pathname, location.search, navigate, session])

  useEffect(() => {
    if (!isAdminRoute) return
    capture(stateRef.current.lastActiveAt)
    const route = `${location.pathname}${location.search}${location.hash}`
    const position = stateRef.current.scrollPositions[route]
    if (typeof position === 'number') window.setTimeout(() => window.scrollTo({ top: Math.min(position, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)), behavior: 'auto' }), 100)
  }, [capture, isAdminRoute, location.hash, location.pathname, location.search])

  useEffect(() => {
    if (!isAdminRoute) return
    const onScroll = () => {
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
      scrollTimer.current = window.setTimeout(() => capture(stateRef.current.lastActiveAt), 180)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        capture(hiddenAt.current)
        void flushNow()
        return
      }
      const leftAt = hiddenAt.current ?? stateRef.current.lastActiveAt
      const elapsed = Date.now() - leftAt
      if (elapsed > ADMIN_RESUME_WINDOW_MS) setLocked(true)
      else if (elapsed > 1200) {
        setNotice('Welcome back — your previous work has been restored.')
        window.setTimeout(() => setNotice(null), 3500)
        void refetch()
      }
      hiddenAt.current = null
    }
    const onPageHide = () => { capture(Date.now()); void flushNow() }
    const onBeforeUnload = () => { capture(Date.now()); void flushNow() }
    const onOnline = () => { setOnline(true); void flushNow(); void refetch() }
    const onOffline = () => { setOnline(false); setSaveStatus('offline') }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('focus', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('focus', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [capture, flushNow, isAdminRoute, refetch])

  const value = useMemo<AdminRecoveryContextValue>(() => ({
    state,
    getUiState,
    setUiState,
    clearUiState,
    registerFlusher,
    flushNow,
    saveStatus,
    setSaveStatus,
  }), [clearUiState, flushNow, getUiState, registerFlusher, saveStatus, setUiState, state])

  const unlock = async (password: string) => {
    if (!user?.email) return setUnlockError('The current Supabase account email is unavailable.')
    setUnlocking(true)
    const error = await signIn(user.email, password, true)
    setUnlocking(false)
    setUnlockError(error)
    if (!error) {
      setLocked(false)
      commit(current => ({ ...current, lastActiveAt: Date.now(), updatedAt: Date.now() }))
      navigate(stateRef.current.route || '/admin', { replace: true })
      setNotice('Welcome back — your previous work has been restored.')
      window.setTimeout(() => setNotice(null), 3500)
    }
  }

  if (isAdminRoute && session && user && loadedUserId.current !== user.id) return <main className="grid min-h-screen place-items-center bg-[#09090B] text-sm text-zinc-300">Restoring your secure workspace…</main>
  if (isAdminRoute && locked && session) return <AdminUnlock email={user?.email ?? ''} busy={unlocking} error={unlockError} onUnlock={password => void unlock(password)} onStartFresh={() => { clearAdminRecovery(user?.id); setLocked(false); navigate('/admin', { replace: true }) }} />

  return <AdminRecoveryContext.Provider value={value}>{children}{notice && <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[10000] -translate-x-1/2 rounded-full border border-emerald-400/25 bg-zinc-950 px-4 py-2 text-xs font-semibold text-emerald-200 shadow-2xl">{notice}</div>}{isAdminRoute && !online && <div role="status" className="fixed right-3 top-[max(.75rem,env(safe-area-inset-top))] z-[10000] rounded-full border border-amber-400/25 bg-zinc-950 px-3 py-2 text-[10px] font-bold text-amber-200">Offline — changes pending</div>}</AdminRecoveryContext.Provider>
}

export function useAdminSessionRecovery() {
  const context = useContext(AdminRecoveryContext)
  if (!context) throw new Error('useAdminSessionRecovery must be used within AdminSessionRecoveryProvider')
  return context
}

export function useAdminRecoveryState<T>(key: string, initialValue: T, validate?: (value: unknown) => value is T): [T, Dispatch<SetStateAction<T>>] {
  const { getUiState, setUiState } = useAdminSessionRecovery()
  const recovered = getUiState<T>(key)
  const usable = recovered !== undefined && (!validate || validate(recovered)) ? recovered : initialValue
  const [value, setValue] = useState<T>(usable)
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    if (recovered !== undefined && (!validate || validate(recovered))) setValue(recovered)
  }, [recovered, validate])
  const setRecoveredValue: Dispatch<SetStateAction<T>> = useCallback(next => {
    setValue(current => {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current) : next
      setUiState(key, resolved)
      return resolved
    })
  }, [key, setUiState])
  return [value, setRecoveredValue]
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import {
  clearProtectedApplicationState,
  setWorkspaceMembership,
  type OrganizationRole,
  type WorkspaceMembership,
} from '../../services/supabase/workspace'

const allowedRoles: OrganizationRole[] = ['owner', 'admin', 'support']
const unauthorizedMessage = 'This account is not authorized to access Apex Bookings.'

type MembershipRow = {
  user_id: string
  organization_id: string
  role: string
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  membership: WorkspaceMembership | null
  organizationId: string | null
  role: OrganizationRole | null
  loading: boolean
  authError: string | null
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  signIn: (email: string, password: string, remember?: boolean) => Promise<string | null>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
  refreshMembership: () => Promise<WorkspaceMembership | null>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function toMembership(row: MembershipRow): WorkspaceMembership | null {
  if (!allowedRoles.includes(row.role as OrganizationRole)) return null
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role as OrganizationRole,
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const requestId = useRef(0)
  const lastApplyError = useRef<string | null>(null)

  const clearAccess = useCallback(() => {
    setSession(null)
    setMembership(null)
    setWorkspaceMembership(null)
    clearProtectedApplicationState()
  }, [])

  const resolveMembership = useCallback(async (nextSession: Session, allowBootstrap: boolean) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const client = supabase

    const loadMembership = async () => {
      const { data, error } = await client
        .from('organization_members')
        .select('user_id, organization_id, role')
        .eq('user_id', nextSession.user.id)
        .maybeSingle()
      if (error) throw error
      return data ? toMembership(data as MembershipRow) : null
    }

    let nextMembership = await loadMembership()
    if (!nextMembership && allowBootstrap) {
      const { error } = await client.rpc('bootstrap_admin_workspace')
      if (error) throw error
      nextMembership = await loadMembership()
    }
    return nextMembership
  }, [])

  const applySession = useCallback(async (nextSession: Session | null, allowBootstrap = false) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setAuthError(null)
    lastApplyError.current = null

    if (!nextSession) {
      clearAccess()
      setLoading(false)
      return null
    }

    try {
      const nextMembership = await resolveMembership(nextSession, allowBootstrap)
      if (!nextMembership) throw new Error(unauthorizedMessage)
      if (currentRequest !== requestId.current) return nextMembership
      setSession(nextSession)
      setMembership(nextMembership)
      setWorkspaceMembership(nextMembership)
      setLoading(false)
      return nextMembership
    } catch (error) {
      if (currentRequest !== requestId.current) return null
      const message = error instanceof Error && error.message ? error.message : unauthorizedMessage
      const unauthorized = message.toLowerCase().includes('not authorized')
      const displayedMessage = unauthorized
        ? unauthorizedMessage
        : `Unable to verify workspace access. Check your connection and retry. ${message}`
      lastApplyError.current = displayedMessage
      setAuthError(displayedMessage)
      setLoading(false)
      if (unauthorized) {
        clearAccess()
        await supabase?.auth.signOut()
      } else {
        setSession(nextSession)
        setMembership(null)
        setWorkspaceMembership(null)
        clearProtectedApplicationState()
      }
      return null
    }
  }, [clearAccess, resolveMembership])

  useEffect(() => {
    if (!supabase) {
      setAuthError('Supabase is not configured. Add the public project URL and anon key.')
      setLoading(false)
      return
    }

    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setAuthError(error.message)
        setLoading(false)
        return
      }
      void applySession(data.session, Boolean(data.session))
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        clearAccess()
        setLoading(false)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        window.setTimeout(() => void applySession(nextSession, event === 'SIGNED_IN'), 0)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [applySession, clearAccess])

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Supabase is not configured.'
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return error.message
    const nextMembership = data.session ? await applySession(data.session, true) : null
    return nextMembership ? null : (lastApplyError.current ?? unauthorizedMessage)
  }, [applySession])

  const logout = useCallback(async () => {
    requestId.current += 1
    clearAccess()
    setAuthError(null)
    if (supabase) await supabase.auth.signOut()
  }, [clearAccess])

  const refreshMembership = useCallback(async () => {
    if (!session) return null
    return applySession(session, false)
  }, [applySession, session])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    membership,
    organizationId: membership?.organizationId ?? null,
    role: membership?.role ?? null,
    loading,
    authError,
    login,
    logout,
    signIn: (email, password) => login(email, password),
    signOut: logout,
    resetPassword: async email => {
      if (!supabase) return 'Supabase is not configured.'
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin/login`,
      })
      return error?.message ?? null
    },
    refreshMembership,
  }), [authError, loading, login, logout, membership, refreshMembership, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

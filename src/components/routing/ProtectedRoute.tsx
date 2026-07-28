import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { ROUTES } from '../../constants/routes'
import { useWorkspaceSync } from '../../services/supabase/WorkspaceSyncProvider'

export function ProtectedAdminRoute() {
  const { session, membership, loading, authError, logout, refreshMembership } = useAuth()
  const location = useLocation()
  const { ready } = useWorkspaceSync()

  if (loading || (session && membership && !ready)) {
    return <div className="grid min-h-screen place-items-center bg-[#09090B] text-sm text-zinc-100">Loading secure workspace…</div>
  }

  if (authError && !membership) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#09090B] p-6 text-zinc-100">
        <section className="w-full max-w-md rounded-2xl border border-red-400/25 bg-zinc-950 p-6 text-center shadow-2xl">
          <h1 className="text-lg font-semibold">{session ? 'Workspace unavailable' : 'Access denied'}</h1>
          <p className="mt-2 text-sm text-zinc-400">{authError}</p>
          <div className="mt-5 flex justify-center gap-3">
            {session && <button className="rounded-xl bg-[#00FF88] px-5 py-2.5 text-sm font-semibold text-zinc-950" onClick={() => void refreshMembership()}>Retry</button>}
            <button className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-100" onClick={() => void logout()}>Return to login</button>
          </div>
        </section>
      </main>
    )
  }

  if (!session) return <Navigate to={ROUTES.adminLogin} replace state={{ from: location.pathname }} />
  if (!membership) return null
  return <Outlet />
}

export const ProtectedRoute = ProtectedAdminRoute

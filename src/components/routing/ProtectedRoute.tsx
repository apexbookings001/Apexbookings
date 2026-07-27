import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { ROUTES } from '../../constants/routes'
import { isSupabaseConfigured } from '../../lib/supabase'
export function ProtectedRoute() { const { session, demoAdmin, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="min-h-screen bg-[#09090B] text-zinc-100 grid place-items-center text-sm">Loading secure workspace…</div>; return session || (!isSupabaseConfigured && demoAdmin) ? <Outlet /> : <Navigate to={ROUTES.adminLogin} replace state={{ from: location.pathname }} /> }

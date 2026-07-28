import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { notificationStore } from '../features/notifications/notificationStore'
import { ROUTES } from '../constants/routes'

const schema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(6, 'Password must contain at least 6 characters'), remember: z.boolean() })
type LoginValues = z.infer<typeof schema>

const unreadNotificationCount = () => notificationStore.unreadCount()

export function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, resetPassword } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(unreadNotificationCount)
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', remember: true } })

  useEffect(() => {
    const refresh = () => setUnreadCount(unreadNotificationCount())
    return notificationStore.subscribe(refresh)
  }, [])

  const onSubmit = async (values: LoginValues) => {
    const message = await signIn(values.email, values.password, values.remember)
    setError(message)
    if (!message) navigate((location.state as { from?: string } | null)?.from ?? ROUTES.admin.dashboard, { replace: true })
  }

  const forgotPassword = async () => {
    const email = getValues('email')
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    const message = await resetPassword(email)
    setError(message)
    setNotice(message ? null : 'Password reset email sent. Check your inbox.')
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#09090B] p-5 text-zinc-50 sm:p-6">
      <video autoPlay muted loop playsInline aria-hidden="true" className="absolute inset-0 h-full w-full object-cover">
        <source src="/admin-login-background.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(5,8,12,.84),rgba(5,8,12,.52)_48%,rgba(5,8,12,.78))]" />

      <section className="relative w-full max-w-md rounded-3xl border border-white/25 bg-zinc-950/55 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="font-serif text-2xl font-bold text-white">Apex Bookings</div>
            <p className="mt-2 text-sm text-zinc-200">Sign in to your secure admin workspace.</p>
          </div>
          <div className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 text-white" aria-label={`${unreadCount} unread admin notifications`} title={`${unreadCount} unread admin notifications`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            {unreadCount > 0 && <span className="absolute -right-2 -top-2 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-zinc-950 bg-emerald-400 px-1 text-[10px] font-black text-zinc-950">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="block text-sm font-medium text-zinc-100">Email<input {...register('email')} type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" />{errors.email && <span className="mt-1 block text-xs text-red-200">{errors.email.message}</span>}</label>
          <label className="block text-sm font-medium text-zinc-100">Password<input {...register('password')} type="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" />{errors.password && <span className="mt-1 block text-xs text-red-200">{errors.password.message}</span>}</label>
          <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-xs text-zinc-200"><input {...register('remember')} type="checkbox" className="accent-emerald-400" />Remember me</label><button type="button" onClick={() => void forgotPassword()} className="text-xs font-medium text-emerald-200 hover:text-emerald-100">Forgot password?</button></div>
          {error && <p role="alert" className="rounded-xl border border-red-300/40 bg-red-950/50 p-3 text-xs text-red-100">{error}</p>}
          {notice && <p className="rounded-xl border border-emerald-300/40 bg-emerald-950/50 p-3 text-xs text-emerald-100">{notice}</p>}
          <button disabled={isSubmitting} className="w-full rounded-xl bg-[#00FF88] py-3 text-sm font-bold text-[#09090B] shadow-lg shadow-emerald-400/20 transition hover:bg-emerald-300 disabled:opacity-60">{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" onClick={() => navigate('/')} className="w-full text-xs text-zinc-300 hover:text-white">Return to booking page</button>
        </form>
      </section>
    </main>
  )
}

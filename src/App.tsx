import { lazy, Suspense, useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ProtectedRoute } from './components/routing/ProtectedRoute'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { ROUTES } from './constants/routes'
import { useAuth } from './features/auth/AuthContext'
import { adminEventStore, PLATFORM_PAYMENT_DEFAULTS, type EventPaymentSettings, type EventSocialProofOverride } from './features/events/adminEventStore'
import type { PaymentMethod } from './types/domain'
import { analyticsStore } from './features/analytics/analyticsStore'
import { DEFAULT_BOOKING_TEMPLATE, createBookingPageData, masterBookingTemplateStore, normalizeBookingPageData, type BookingPageData, type BookingSectionId, type BookingPackage } from './features/events/bookingTemplate'
import { PACKAGE_TYPE_LIBRARY, createPackageFromType, type PackageTypeDefinition } from './features/events/packageTypeLibrary'
import { mediaLibraryStore } from './features/media/mediaLibraryStore'
import { PublicConversionEnhancements } from './features/conversion/PublicConversionEnhancements'
import { SocialProofOverlayProvider, useSocialProofOverlay } from './features/conversion/SocialProofOverlayContext'
import { PublicOnboardingGuide } from './components/OnboardingGuide'
import { PublicSupportChat } from './features/support/PublicSupportChat'
import { PaymentMethodCard } from './features/payments/PaymentMethodCard'
import { CryptoSelector } from './features/payments/CryptoSelector'
import { CryptoPaymentDetail } from './features/payments/CryptoPaymentDetail'
import type { CryptoCoin } from './features/payments/CryptoSelector'
import { getPaymentIcon } from './features/payments/PaymentAssets'
import movieTicketLogo from '../icons/movie-ticket.gif'
import instagramIcon from '../icons/instagram.png'
import youtubeIcon from '../icons/youtube.png'
import twitterIcon from '../icons/twitter.png'
import hourglassIcon from '../icons/hourglass.gif'
import verifiedHeroIcon from '../icons/verified.png'
import linkedinIcon from '../icons/linkedin.png'
import { ticketStore } from './features/bookings/ticketStore'
import { paymentReviewStore } from './features/payments/paymentReviewStore'
import { bankTransferStore, type BankTransferRequest } from './features/payments/bankTransferStore'
import { emailService } from './features/email/emailService'
import { createPublicCheckout } from './services/supabase/publicCheckoutRepository'
import { createPublicBankTransfer } from './services/supabase/publicBankTransferRepository'
import { uploadPaymentProofs } from './services/supabase/paymentProofRepository'
import { QRCodeSVG } from 'qrcode.react'
import { sessionPersistence, type PersistedBookingState } from './features/bookings/sessionPersistence'
import { TicketVerificationPage } from './pages/TicketVerificationPage'
import { LocaleProvider, useLocale, tr as trFn } from './i18n/LocaleContext'
import { LocaleIndicator } from './components/LocaleIndicator'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { EventHero } from './components/EventHero'
import { useAdminSessionRecovery } from './features/recovery/AdminSessionRecoveryProvider'
import { useBookingSessionRecovery } from './features/recovery/BookingSessionRecoveryProvider'
import { getAdminResumeRoute } from './features/recovery/recoveryStorage'
const AdminDashboard = lazy(() => import('./AdminDashboard'))

import { ThemeCtx, useTheme, DARK, LIGHT } from './theme'
type BookingMode = 'preview' | 'editor' | 'published'
type StudioPreviewState = 'page' | 'packages' | 'checkout' | 'payment-pending' | 'awaiting-bank-details' | 'payment-submitted' | 'payment-approved' | 'payment-declined' | 'ticket-confirmation'
type EditorTarget = { section: BookingSectionId; index?: number; field?: string }
const BOOKING_SECTION_IDS: BookingSectionId[] = ['hero', 'about', 'venue', 'timeline', 'tickets', 'testimonials', 'faq', 'cta', 'footer']
const BOOKING_SECTION_LABELS: Record<BookingSectionId, string> = { hero: 'Hero', about: 'About', venue: 'Venue', timeline: 'Timeline', tickets: 'Packages', testimonials: 'Customer reviews', faq: 'FAQ', cta: 'Call to action', footer: 'Footer' }
type BookingContextValue = { data: BookingPageData; mode: BookingMode; select: (target: EditorTarget) => void; payments: EventPaymentSettings; eventId?: string; previewState: StudioPreviewState; simulationOnly: boolean }
const BookingCtx = createContext<BookingContextValue>({ data: DEFAULT_BOOKING_TEMPLATE, mode: 'preview', select: () => { }, payments: PLATFORM_PAYMENT_DEFAULTS, previewState: 'page', simulationOnly: false })
const useBooking = () => useContext(BookingCtx)

function EditableTarget({ target, className = '', children }: { target: EditorTarget; className?: string; children: React.ReactNode }) {
  const { data, mode, select } = useBooking()
  if (mode !== 'editor') return <>{children}</>
  const showStatus = target.index === undefined
  const touched = data.editorState?.touchedSections.includes(target.section) ?? false
  return <div className={`relative cursor-pointer outline-none transition-shadow hover:ring-2 hover:ring-emerald-400/70 ${className}`} onClick={event => { event.stopPropagation(); select(target) }} onDoubleClick={event => { event.stopPropagation(); select(target) }}>{showStatus && <span className={`pointer-events-none absolute right-3 z-[210] rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider shadow-xl backdrop-blur ${target.section === 'hero' ? 'top-24' : 'top-3'} ${touched ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200' : 'border-amber-400/30 bg-amber-400/15 text-amber-200'}`}>{touched ? '✓ Edited' : '● Untouched'}</span>}{children}</div>
}

// ─── Event constants ──────────────────────────────────────────────────────────
const EVENT = {
  artist: 'DRAKE', tour: "It's All A Blur Tour",
  tagline: 'LIVE AT MADISON SQUARE GARDEN — NEW YORK',
  date: 'Saturday, September 20, 2025',
  doors: '6:00 PM', show: '8:00 PM EDT',
  venue: 'Madison Square Garden',
  address: '4 Pennsylvania Plaza, New York, NY 10001',
  support: '21 Savage — Special Guest',
  runtime: '~150 min including intermission',
}

const TIERS = [
  { id: 0, name: 'Regular', price: 189, desc: 'Upper level seating', badge: 'Great Value' as string | null, accent: '#64748B', glow: 'rgba(100,116,139,0.2)', seats: 312, icon: '🎫', sections: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312'] },
  { id: 1, name: 'VIP Floor', price: 450, desc: 'Premium lower bowl', badge: 'Best Seller', accent: '#00D982', glow: 'rgba(0,217,130,0.24)', seats: 86, icon: '💎', sections: ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'] },
  { id: 2, name: 'VVIP Platinum', price: 850, desc: 'Floor level & private lounge', badge: 'Ultimate Access', accent: '#F59E0B', glow: 'rgba(245,158,11,0.25)', seats: 12, icon: '👑', sections: ['GA Floor', 'Platinum Suite A', 'Platinum Suite B'] },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useReveal(dependency?: unknown) {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (e) => e.forEach((x) => { if (x.isIntersecting) x.target.classList.add('visible') }),
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    )
    document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [dependency])
}

function AnimatedMetric({ value }: { value: string | number }) {
  const metricRef = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    const rawValue = String(value)
    const match = rawValue.match(/-?\d+(?:\.\d+)?/)
    if (!match) { setDisplay(rawValue); return }
    const target = Number(match[0])
    const decimals = match[0].includes('.') ? match[0].split('.')[1].length : 0
    const prefix = rawValue.slice(0, match.index)
    const suffix = rawValue.slice((match.index ?? 0) + match[0].length)
    let frame = 0
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) return
      const startedAt = performance.now()
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / 900)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(`${prefix}${(target * eased).toFixed(decimals)}${suffix}`)
        if (progress < 1) frame = requestAnimationFrame(animate)
      }
      frame = requestAnimationFrame(animate)
      observer.disconnect()
    }, { threshold: 0.45 })
    if (metricRef.current) observer.observe(metricRef.current)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])

  return <span ref={metricRef}>{display}</span>
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ─── Scroll progress ──────────────────────────────────────────────────────────
function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const fn = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const total = document.documentElement.scrollHeight - window.innerHeight
        const progress = total > 0 ? Math.min(1, window.scrollY / total) : 0
        if (bar.current) bar.current.style.transform = `scaleX(${progress})`
      })
    }
    window.addEventListener('scroll', fn, { passive: true })
    fn()
    return () => { window.removeEventListener('scroll', fn); if (frame) cancelAnimationFrame(frame) }
  }, [])
  return <div ref={bar} className="scroll-progress" />
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('')
  const show = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2800)
  }, [])
  return { msg, show }
}

function Toast({ msg }: { msg: string }) {
  const { t } = useTheme()
  if (!msg) return null
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl text-sm font-semibold shadow-2xl"
      style={{ background: t.isDark ? 'linear-gradient(135deg,#00FF88,#00C866)' : 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: t.isDark ? '#09090B' : '#FFFFFF', animation: 'fade-in-up 0.3s ease', boxShadow: t.isDark ? '0 8px 32px rgba(0,255,136,0.3)' : '0 8px 32px rgba(37,99,235,0.25)' }}
    >
      {msg}
    </div>
  )
}

// ─── Particles ────────────────────────────────────────────────────────────────
function Particles() {
  const ps = useRef(Array.from({ length: 22 }, (_, i) => ({
    id: i, left: Math.random() * 100, size: Math.random() * 2.5 + 0.8,
    dur: Math.random() * 9 + 7, delay: Math.random() * 8,
    drift: (Math.random() - 0.5) * 70,
    color: ['#00FF88', '#8B5CF6', '#F59E0B', '#22D3EE'][Math.floor(Math.random() * 4)],
  }))).current
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {ps.map((p) => (
        <div key={p.id} className="absolute bottom-0 rounded-full"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size, backgroundColor: p.color,
            '--drift': `${p.drift}px`, animation: `particle-rise ${p.dur}s ${p.delay}s linear infinite`, opacity: 0.45,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

// ─── Locale-aware helpers ─────────────────────────────────────────────────────
function NavBookBtn({ mobile }: { mobile?: boolean }) {
  const { translations: tr } = useLocale()
  const { t } = useTheme()
  return (
    <button onClick={() => scrollTo('tickets')}
      className={`btn-magnetic font-bold rounded-xl transition-all hover:-translate-y-0.5 ${mobile ? 'flex-1 text-sm py-2.5 text-center' : 'text-sm px-5 py-2'}`}
      style={{ background: t.isDark ? `${t.accent}18` : `linear-gradient(135deg,${t.accent},${t.accentDim})`, color: t.isDark ? t.accent : t.accentText, border: t.isDark ? `1px solid ${t.accent}40` : 'none', boxShadow: t.isDark ? `0 8px 24px ${t.accentGlow}` : `0 4px 16px ${t.accentGlow}`, borderRadius: 14 }}>
      {tr.nav.bookTickets}
    </button>
  )
}

function LocalizedTicketHeading() {
  const { translations: tr } = useLocale()
  const { t } = useTheme()
  return (
    <div className="text-center mb-12 reveal">
      <div className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: t.textMuted }}>{tr.tickets.eyebrow}</div>
      <h2 className="font-serif text-4xl md:text-5xl font-bold mb-4" style={{ color: t.text }}>{tr.tickets.heading}</h2>
      <p style={{ color: t.textSub }}>{tr.tickets.subheading}</p>
    </div>
  )
}

function LocalizedBookBtn({ tier, premium = false }: { tier: { name: string; accent: string; glow: string }; premium?: boolean }) {
  const { translations: tr } = useLocale()
  const { t } = useTheme()
  const accent = t.isDark ? tier.accent : t.accent
  return (
    <button className="w-full py-3.5 rounded-2xl font-bold text-sm text-center transition-all duration-300 hover:-translate-y-1"
      style={{ background: t.isDark ? `${accent}18` : premium ? `linear-gradient(135deg,${t.accent},${t.accentDim})` : `${accent}0D`, color: t.isDark || !premium ? accent : '#FFFFFF', border: `1.5px solid ${t.isDark ? `${accent}40` : accent}`, boxShadow: t.isDark ? `0 8px 24px ${tier.glow}` : premium ? `0 10px 20px ${t.accentGlow}` : `0 3px 8px ${t.accentGlow}` }}>
      {tr.tickets.bookNow} {tier.name} →
    </button>
  )
}

function LocalizedNewsletterRow({ email, setEmail, show }: { email: string; setEmail: (v: string) => void; show: (m: string) => void }) {
  const { translations: tr } = useLocale()
  const { t } = useTheme()
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
      <div className="flex-1 min-w-0">
        <div className="font-semibold mb-1" style={{ color: t.isDark ? t.text : '#0F172A' }}>{tr.footer.stayInLoop}</div>
        <div className="text-sm" style={{ color: t.isDark ? t.textMuted : '#334155' }}>{tr.footer.stayInLoopSub}</div>
      </div>
      <div className="flex flex-wrap gap-2 w-full md:w-auto">
        <input type="email" placeholder={tr.footer.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-0 md:w-56 px-4 py-3 rounded-xl text-sm outline-none transition-shadow focus:ring-2"
          style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, boxShadow: t.inputShadow, '--tw-ring-color': t.accentGlow } as React.CSSProperties} />
        <button onClick={() => { if (email) { show(tr.toast.subscribed); setEmail('') } }}
          className="px-5 py-3 rounded-xl text-sm font-semibold shrink-0 transition-all hover:-translate-y-1"
          style={{ background: `linear-gradient(135deg,${t.accent},${t.accentDim})`, color: '#FFFFFF', boxShadow: `0 4px 16px ${t.accentGlow}` }}>
          {tr.footer.subscribe}
        </button>
      </div>
    </div>
  )
}

function LocalizedFooterBottom({ show }: { show: (m: string) => void }) {
  const { translations: tr, t: translate } = useLocale()
  const { data } = useBooking()
  const { t } = useTheme()
  return (
    <div className="border-t pt-6 flex flex-wrap items-center justify-between gap-4" style={{ borderColor: t.border }}>
      <div className="text-xs" style={{ color: t.isDark ? t.textMuted : '#475569' }}>{data.footer.copyright}</div>
      <div className="flex items-center gap-5">
        {([tr.footer.privacy, tr.footer.terms, tr.footer.cookies] as string[]).map((l) => (
          <button key={l} onClick={() => show(translate('footer.opening', { label: l }))} className="text-xs transition-colors" style={{ color: t.isDark ? t.textMuted : '#475569' }}>{l}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: t.isDark ? t.textMuted : '#475569' }}>
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22C55E' }} />
        {tr.footer.allSystems}
      </div>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { key: 'navigation.home', id: 'hero' }, { key: 'navigation.about', id: 'about' },
  { key: 'navigation.venue', id: 'venue' }, { key: 'navigation.packages', id: 'tickets' },
  { key: 'navigation.timeline', id: 'timeline' }, { key: 'navigation.reviews', id: 'testimonials' },
  { key: 'navigation.faq', id: 'faq' }, { key: 'navigation.contact', id: 'footer' },
]

function Nav({ onToggleTheme, onAdminClick }: { onToggleTheme: () => void; onAdminClick: () => void }) {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data } = useBooking()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { show } = useToast()
  const { isOverlayActive } = useSocialProofOverlay()
  const logoTaps = useRef({ count: 0, timer: 0 })

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const handleLogoClick = () => {
    scrollTo('hero')
    logoTaps.current.count += 1
    window.clearTimeout(logoTaps.current.timer)
    if (logoTaps.current.count === 5) {
      logoTaps.current.count = 0
      onAdminClick()
      return
    }
    logoTaps.current.timer = window.setTimeout(() => { logoTaps.current.count = 0 }, 1600)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(2, 6, 23, 0.28)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setOpen(false)}
        />
      )}
      <nav
        className="booking-nav fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-7xl rounded-2xl px-5 py-3 flex items-center gap-4 transition-all duration-500"
        style={{
          background: scrolled ? t.navBg : 'transparent',
          backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
          border: scrolled ? `1px solid ${t.isDark ? t.border : 'rgba(0,0,0,0.07)'}` : '1px solid transparent',
          boxShadow: scrolled ? (t.isDark ? '0 8px 40px rgba(0,0,0,0.35)' : '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)') : 'none',
          // Fade out when social proof overlay is active (mobile only)
          opacity: isOverlayActive ? 0 : 1,
          pointerEvents: isOverlayActive ? 'none' : 'auto',
          transition: isOverlayActive
            ? 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), background 500ms, backdrop-filter 500ms, border 500ms, box-shadow 500ms'
            : 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1) 250ms, background 500ms, backdrop-filter 500ms, border 500ms, box-shadow 500ms',
        }}
      >
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0 mr-2 cursor-pointer" onClick={handleLogoClick}>
        <div className="w-9 h-9 rounded-xl p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ background: t.isDark ? 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))' : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(226,232,240,0.9))', border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'}` }}>
          <img src={movieTicketLogo} alt="App logo" className="w-full h-full object-contain rounded-[10px]" />
        </div>
        <span className="font-serif font-bold text-lg" style={{ color: t.text, textShadow: t.isDark ? '0 1px 2px rgba(0,0,0,0.45)' : '0 1px 2px rgba(255,255,255,0.7)' }}>{data.footer.brand}</span>
      </div>

      {/* Desktop links */}
      <div className="hidden lg:flex items-center gap-0.5 flex-1">
        {NAV_LINKS.map((l) => (
          <button key={l.id} onClick={() => scrollTo(l.id)}
            className="px-3 py-1.5 text-sm rounded-lg transition-colors duration-200"
            style={{ color: t.textSub }}
            onMouseEnter={(e) => (e.currentTarget.style.color = t.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = t.textSub)}
          >{translate(l.key)}</button>
        ))}
      </div>

      {/* Right side */}
      <div className="hidden lg:flex items-center gap-2 ml-auto">
        {/* Locale indicator */}
        <LocaleIndicator isDark={t.isDark} textColor={t.textSub} borderColor={t.border} cardBg={t.isDark ? '#111113' : '#FFFFFF'} />
        {/* Dark/Light toggle */}
        <button
          onClick={onToggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{ background: t.card, border: `1px solid ${t.border}`, color: t.textSub }}
          title={translate(t.isDark ? 'navigation.lightMode' : 'navigation.darkMode')}
        >
          {t.isDark
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          }
        </button>

        <NavBookBtn />
      </div>

      {/* Mobile toggle */}
      <button aria-label={translate(open ? 'navigation.closeMenu' : 'navigation.openMenu')} className="lg:hidden ml-auto p-2 rounded-lg transition-all hover:-translate-y-0.5" style={{ color: t.textSub, background: t.card, border: `1px solid ${t.isDark ? t.border : '#E5E7EB'}`, boxShadow: t.isDark ? '0 4px 16px rgba(0,255,136,0.2)' : '0 2px 8px rgba(0,0,0,0.08)' }} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
        </svg>
      </button>

      {/* Mobile menu */}
      {open && (
        <div
          className="booking-mobile-menu absolute top-full left-0 right-0 mt-2 rounded-2xl p-5 shadow-2xl z-50"
          style={{
            background: t.isDark ? '#111113' : '#FFFFFF',
            border: `1px solid ${t.border}`,
            backdropFilter: 'blur(24px)',
          }}
        >
          {NAV_LINKS.map((l) => (
            <button key={l.id} onClick={() => { scrollTo(l.id); setOpen(false) }}
              className="block w-full text-left py-2.5 px-3 rounded-xl text-sm transition-colors mb-1"
              style={{ color: t.textSub, background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.card; e.currentTarget.style.color = t.text }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textSub }}
            >{translate(l.key)}</button>
          ))}
          <div className="flex gap-2 pt-3 mt-2 border-t" style={{ borderColor: t.border }}>
            <button onClick={onToggleTheme} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs flex-1 justify-center" style={{ background: t.card, border: `1px solid ${t.border}`, color: t.textSub }}>
              {translate(t.isDark ? 'navigation.lightMode' : 'navigation.darkMode')}
            </button>
            <NavBookBtn mobile />
          </div>
        </div>
      )}
      </nav>
    </>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1546707012-c46675f12716?w=1600&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1577648884063-1d3d1477b8a7?w=1600&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1501962679900-bea61483313b?w=1600&h=900&fit=crop&auto=format',
]

function LegacyHero() {
  const { t } = useTheme()
  const { data, mode } = useBooking()
  const { formatPrice } = useLocale()
  const hero = data.hero
  const [imgIdx, setImgIdx] = useState(0)
  const startingPrice = data.packages.length > 0 ? Math.min(...data.packages.map(item => item.price)) : null
  const availableSeats = data.packages.reduce((total, item) => total + Math.max(0, item.seats), 0)
  const accent = t.isDark ? t.accent : '#60A5FA'
  useEffect(() => {
    if (hero.images.length < 2) return
    const id = window.setInterval(() => setImgIdx(index => (index + 1) % hero.images.length), 5600)
    return () => window.clearInterval(id)
  }, [hero.images.length])
  if (!data.visibility.hero && mode !== 'editor') return null
  return <EditableTarget target={{ section: 'hero' }}>
    <section id="hero" className={`relative flex min-h-[100svh] w-full items-end overflow-hidden md:min-h-[min(900px,100dvh)] md:items-center ${mode !== 'editor' ? 'hero-machine-entry' : ''} ${!data.visibility.hero ? 'opacity-40' : ''}`}>
      <div className="absolute inset-0 bg-zinc-950">
        {hero.images.map((src, index) => <div key={`${src}-${index}`} className="absolute inset-0 transition-opacity duration-1000 ease-out" style={{ opacity: index === imgIdx ? 1 : 0 }}>
          <img src={src} alt={`${hero.title} live`} width="1600" height="900" className="h-full w-full object-cover object-center" style={{ animation: index === imgIdx ? 'ken-burns 12s ease-out forwards' : 'none' }} />
        </div>)}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,9,11,.1)_0%,rgba(9,9,11,.42)_42%,rgba(9,9,11,.98)_88%)] md:bg-[linear-gradient(90deg,rgba(9,9,11,.97)_0%,rgba(9,9,11,.82)_42%,rgba(9,9,11,.36)_72%,rgba(9,9,11,.58)_100%)]" />
        <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 72% 38%, ${accent}28 0%, transparent 31%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-zinc-950 to-transparent" />
      </div>

      <div className="pointer-events-none absolute right-[-7rem] top-[18%] hidden aspect-square w-[34rem] rounded-full border border-white/10 md:block" />
      <div className="pointer-events-none absolute right-[-3rem] top-[25%] hidden aspect-square w-[24rem] rounded-full border border-white/10 md:block" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-32 sm:px-8 md:grid-cols-[minmax(0,1.25fr)_minmax(310px,.75fr)] md:items-end md:gap-12 md:py-32 lg:px-10">
        <div className="hero-machine-copy min-w-0">
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-white/85 sm:text-xs">
            <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: accent }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: accent }} /></span>
            <span className="truncate">{hero.eyebrow}</span>
          </div>

          <p className="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-white/60 sm:text-sm">{hero.tour}</p>
          <h1 className="max-w-4xl break-words font-serif font-bold leading-[.82] tracking-[-.055em] text-white" style={{ fontSize: 'clamp(3.6rem,9vw,8.25rem)', textShadow: '0 18px 70px rgba(0,0,0,.45)' }}>{hero.title}</h1>

          {hero.guests.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-white/80"><span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 font-semibold text-amber-200">With special guest{hero.guests.length > 1 ? 's' : ''}</span><span>{hero.guests.join(' · ')}</span></div>}

          <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 text-sm text-white sm:grid-cols-3">
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-3.5"><span className="hero-machine-icon mt-0.5 text-lg" aria-hidden="true">◷</span><div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">Date & time</div><div className="mt-1 font-semibold leading-snug">{hero.date}</div><div className="mt-0.5 text-xs text-white/55">Doors {hero.doors} · Show {hero.show}</div></div></div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-3.5 sm:col-span-2"><span className="hero-machine-icon mt-0.5 text-lg" aria-hidden="true">⌖</span><div className="min-w-0"><div className="text-[10px] uppercase tracking-[.18em] text-white/45">Venue</div><div className="mt-1 font-semibold leading-snug">{hero.venue}</div><div className="mt-0.5 truncate text-xs text-white/55">{hero.address}</div></div></div>
          </div>

          {hero.images.length > 1 && <div className="mt-7 flex items-center gap-2" aria-label="Event image gallery">{hero.images.map((_, index) => <button key={index} type="button" aria-label={`Show banner ${index + 1}`} aria-current={index === imgIdx} onClick={() => setImgIdx(index)} className="h-1.5 rounded-full transition-[width,background-color] duration-300" style={{ width: index === imgIdx ? 34 : 10, background: index === imgIdx ? accent : 'rgba(255,255,255,.3)' }} />)}</div>}
        </div>

        <aside className="hero-machine-card overflow-hidden rounded-[1.75rem] border border-white/15 bg-zinc-950/75 shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-xl">
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
          <div className="p-5 sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-[10px] font-bold uppercase tracking-[.22em]" style={{ color: accent }}>Official event access</div><h2 className="mt-2 font-serif text-2xl font-bold text-white sm:text-3xl">Your night starts here.</h2></div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[.07] text-xl" aria-hidden="true">🎟</div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/60">Choose your package, secure your preferred seat, and receive your booking confirmation in minutes.</p>

            <div className="my-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div><div className="text-[10px] uppercase tracking-[.16em] text-white/40">Tickets from</div><div className="mt-1 text-xl font-bold text-white">{startingPrice === null ? 'View packages' : formatPrice(startingPrice)}</div></div>
              <div className="border-l border-white/10 pl-4"><div className="text-[10px] uppercase tracking-[.16em] text-white/40">Availability</div><div className="mt-1 text-xl font-bold text-white">{availableSeats > 0 ? `${availableSeats.toLocaleString()} seats` : `${data.packages.length} packages`}</div></div>
            </div>

            <button type="button" onClick={() => scrollTo('tickets')} className="group flex min-h-14 w-full items-center justify-between rounded-2xl px-5 py-4 text-left text-sm font-extrabold text-zinc-950 shadow-lg transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0" style={{ background: `linear-gradient(135deg, ${accent}, #FFFFFF)`, boxShadow: `0 16px 42px ${accent}35` }}><span>{hero.primaryCta || 'Choose your tickets'}</span><span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-950 text-base text-white transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span></button>
            <button type="button" onClick={() => scrollTo('about')} className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[.05] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">{hero.secondaryCta || 'Explore the event'}</button>

            <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-[10px] font-semibold uppercase tracking-[.11em] text-white/45"><span>✓ Secure checkout</span><span>✓ Instant confirmation</span><span>✓ Mobile ticket</span></div>
          </div>
        </aside>
      </div>
    </section>
  </EditableTarget>
}
function Hero() {
  const { t } = useTheme()
  const { data, mode } = useBooking()
  const { formatPrice } = useLocale()
  if (!data.visibility.hero && mode !== 'editor') return null
  return <EditableTarget target={{ section: 'hero' }}>
    <div className={!data.visibility.hero ? 'opacity-40' : ''}>
      <EventHero hero={data.hero} packages={data.packages} accent={t.isDark ? t.accent : '#60A5FA'} formatPrice={formatPrice} onPrimary={() => scrollTo('tickets')} onSecondary={() => scrollTo('about')} editorMode={mode === 'editor'} />
    </div>
  </EditableTarget>
}
function AboutShow() {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data, mode } = useBooking()
  const about = data.about
  const mediaIsVideo = about.mediaType === 'video'

  if (!data.visibility.about && mode !== 'editor') return null

  return (
    <EditableTarget target={{ section: 'about' }}><section id="about" className={`booking-section premium-about py-24 px-6 relative overflow-hidden ${!data.visibility.about ? 'opacity-40' : ''}`} style={{ background: t.isDark ? 'transparent' : t.bg3 }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="about-media-reveal reveal">
            <div className="about-media-card" style={{ background: t.isDark ? '#111311' : '#FFFFFF', borderColor: t.isDark ? 'rgba(255,255,255,.11)' : '#E5E7EB', boxShadow: t.isDark ? '0 28px 80px rgba(0,0,0,.42)' : '0 24px 70px rgba(15,23,42,.14)' }}>
              <div className="about-media-viewport">
                {about.image ? mediaIsVideo ? (
                  <video src={about.image} controls playsInline preload="metadata" aria-label={`${about.heading} event video`} className="h-full w-full object-contain" />
                ) : (
                  <img src={about.image} alt={`${about.heading} event`} width="960" height="720" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full min-h-72 place-items-center px-6 text-center text-sm" style={{ color: t.textMuted }}>{translate('about.mediaEmpty')}</div>
                )}
                <div className="about-media-sheen" aria-hidden="true" />
                <span className="about-media-kind">{translate(mediaIsVideo ? 'about.eventVideo' : 'about.eventImage')}</span>
              </div>
              <div className="about-media-details">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: t.textMuted }}>{translate('about.showDate')}</div>
                  <div className="mt-1 font-serif text-2xl font-bold" style={{ color: t.text }}>{about.dateLabel}</div>
                  <div className="mt-1 text-xs" style={{ color: t.textSub }}>{about.dateDetail}</div>
                </div>
                <div className="about-media-official" style={{ color: t.accent, borderColor: `${t.accent}45`, background: `${t.accent}12` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: t.accent }} /> {translate('about.official')}</div>
              </div>
            </div>
          </div>

          <div className="reveal-right">
            <div className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: t.textMuted }}>{data.sectionHeadings?.about || translate('about.section')}</div>
            <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6 leading-tight" style={{ color: t.text, textShadow: t.isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 1px 2px rgba(15,23,42,0.12)' }}>
              {about.heading}<br /><span className="text-gradient-emerald">{about.accentHeading}</span>
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: t.textSub }}>
              {about.body}
            </p>
            <p className="text-base leading-relaxed mb-8" style={{ color: t.textSub }}>
              {about.detail}
            </p>

            {about.highlights.length > 0 && <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {about.highlights.map(item => <div key={`${item.label}-${item.value}`} className="metric-card rounded-2xl p-4" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
                <div className="text-lg" aria-hidden="true">{item.icon}</div>
                <div className="mt-2 font-serif text-2xl font-bold" style={{ color: t.text }}><AnimatedMetric value={item.value} /></div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>{item.label}</div>
              </div>)}
            </div>}

            <div className="premium-info-card p-6 rounded-2xl" style={{ background: t.isDark ? 'rgba(0,255,136,0.05)' : 'rgba(37,99,235,0.05)', border: `1px solid ${t.isDark ? 'rgba(0,255,136,0.15)' : 'rgba(37,99,235,0.15)'}` }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: t.accent }}>{translate('about.everyTicket')}</div>
              <div className="grid grid-cols-2 gap-2">
                {about.inclusions.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm" style={{ color: t.textSub }}>
                    <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: t.isDark ? 'rgba(0,255,136,0.15)' : 'rgba(37,99,235,0.12)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2.5" className="w-2.5 h-2.5"><path d="M5 13l4 4L19 7" /></svg>
                    </div>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section></EditableTarget>
  )
}

// ─── Venue Map ────────────────────────────────────────────────────────────────
function VenueMap() {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data, mode } = useBooking()
  const venue = data.venue
  const venueFacts = data.venueFacts || []
  const importantInfo = data.importantInfo || []

  if (!data.visibility.venue && mode !== 'editor') return null
  return (
    <EditableTarget target={{ section: 'venue' }}><section id="venue" className={`booking-section premium-venue py-24 px-6 ${!data.visibility.venue ? 'opacity-40' : ''}`} style={{ background: t.isDark ? t.bg2 : t.sectionAlt }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14 reveal">
          <div className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: t.textMuted }}>{data.sectionHeadings?.venue || translate('venue.section')}</div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold mb-4" style={{ color: t.text }}>{venue.name}</h2>
          <p style={{ color: t.textSub }}>{venue.address}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="reveal-left">
            <div className="premium-media rounded-3xl overflow-hidden relative h-full min-h-[380px]">
              <img src={venue.image} alt={`${venue.name} arena`} width="1200" height="800" className="w-full h-full object-cover absolute inset-0" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(9,9,11,0.85) 0%, transparent 60%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-serif text-2xl font-bold text-white mb-1">{venue.name}</div>
                    <div className="text-sm text-zinc-400 flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /></svg>
                      {venue.address}
                    </div>
                  </div>
                  <a href={venue.mapLink} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-1 hover:scale-105"
                    style={{ background: `linear-gradient(135deg,${t.accent},${t.accentDim})`, color: t.accentText, boxShadow: `0 4px 16px ${t.accentGlow}` }}>
                    {translate('venue.openMaps')} →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 reveal-right flex flex-col justify-center">
            {venueFacts.some(f => f.visible) && (
              <div className="premium-card p-6 rounded-3xl" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
                <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: t.textMuted }}>{data.sectionHeadings?.venueFacts || translate('venue.facts')}</div>
                {venueFacts.filter(f => f.visible).map(fact => (
                  <div key={fact.id} className="flex justify-between py-2.5 border-b text-sm last:border-b-0 last:pb-0" style={{ borderColor: t.isDark ? t.border : '#F3F4F6' }}>
                    <span style={{ color: t.textMuted }}>{fact.label}</span>
                    <span className="font-semibold" style={{ color: t.text }}>{fact.value}</span>
                  </div>
                ))}
              </div>
            )}
            {importantInfo.filter(i => i.visible).map(info => (
              <div key={info.id} className="premium-card p-6 rounded-3xl" style={{ background: t.isDark ? 'rgba(0,255,136,0.06)' : t.card, border: `1px solid ${t.isDark ? 'rgba(0,255,136,0.2)' : t.border}` }}>
                <div className="font-semibold text-sm mb-3" style={{ color: t.accent }}>{info.icon} {info.title}</div>
                <ul className="space-y-1.5 text-sm" style={{ color: t.textSub }}>
                  {info.body.split('\n').map((line, idx) => (
                    <li key={idx}>
                      {line.split('**').map((part, pIdx) => (
                        pIdx % 2 === 1 ? <strong key={pIdx} style={{ color: t.text }}>{part}</strong> : part
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section></EditableTarget>
  )
}

// ─── Event Timeline ───────────────────────────────────────────────────────────
const TIMELINE = [
  { time: '6:00 PM', title: 'Doors Open', desc: 'Gates open. Security check and wristband collection begins.', icon: '🚪', accent: '#52525B' },
  { time: '6:30 PM', title: 'VIP Check-In', desc: 'Dedicated VIP lane opens. Collect lounge passes and meet-and-greet confirmation.', icon: '✅', accent: '#22D3EE' },
  { time: '7:00 PM', title: 'Pre-Show DJ Set', desc: 'Resident DJ warms up the crowd with an exclusive 60-minute mix.', icon: '🎧', accent: '#8B5CF6' },
  { time: '8:00 PM', title: 'Drake Takes the Stage', desc: "The moment the city has been waiting for. 150 minutes of pure Drake — hits spanning his entire career.", icon: '⭐', accent: '#00FF88' },
  { time: '9:45 PM', title: '21 Savage — Special Set', desc: 'Surprise joint set. Two icons, one stage, one night.', icon: '🔥', accent: '#F59E0B' },
  { time: '10:30 PM', title: 'Grand Finale & Encore', desc: 'Closing ceremony with pyrotechnics and a setlist deep cut you will never forget.', icon: '🎆', accent: '#F59E0B' },
]

function EventTimeline() {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data, mode } = useBooking()
  if (!data.visibility.timeline && mode !== 'editor') return null
  return (
    <EditableTarget target={{ section: 'timeline' }}><section id="timeline" className={`booking-section premium-timeline py-24 px-6 ${!data.visibility.timeline ? 'opacity-40' : ''}`}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16 reveal">
          <div className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: t.textMuted }}>{data.sectionHeadings?.timeline || translate('timeline.eyebrow')}</div>
          <h2 className="font-serif text-4xl font-bold mb-4" style={{ color: t.text }}>{translate('timeline.heading')}</h2>
        </div>
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px" style={{ background: `linear-gradient(to bottom, transparent, ${t.border} 10%, ${t.border} 90%, transparent)` }} />
          <div className="space-y-0">
            {data.timeline.map((item, i) => (
              <EditableTarget key={item.id} target={{ section: 'timeline', index: i }}><div className="timeline-card reveal flex gap-5 p-4 sm:p-5 mb-4 relative rounded-3xl" style={{ transitionDelay: `${i * 0.07}s`, background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
                <div className="relative z-10 shrink-0">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg" style={{ background: `${item.accent}15`, border: `1px solid ${item.accent}35`, boxShadow: `0 4px 16px ${item.accent}30` }}>
                    {item.icon}
                  </div>
                  {i === 3 && <div className="absolute inset-0 rounded-2xl animate-ping" style={{ background: `${item.accent}20`, animationDuration: '2.5s' }} />}
                </div>
                <div className="pt-2">
                  <div className="font-mono text-xs mb-1" style={{ color: item.accent }}>{item.time}</div>
                  <div className="font-serif text-xl font-bold mb-1" style={{ color: t.text }}>{item.title}</div>
                  <div className="text-sm leading-relaxed" style={{ color: t.textSub }}>{item.desc}</div>
                </div>
              </div></EditableTarget>
            ))}
          </div>
        </div>
      </div>
    </section></EditableTarget>
  )
}

// ─── Numbered Seat Grid ────────────────────────────────────────────────────────
type SeatStatus = 'available' | 'selected' | 'sold' | 'other-package'

function SeatGrid({
  totalSeats, selectedSeat, onSelectSeat, onAttemptTakenSeat, soldSeats, otherPkgSeats
}: {
  totalSeats: number
  selectedSeat: number | null
  onSelectSeat: (n: number) => void
  onAttemptTakenSeat?: (n: number) => void
  soldSeats: number[]
  otherPkgSeats: number[]
}) {
  const { t } = useTheme()
  const { translations: tr } = useLocale()
  const getStatus = (n: number): SeatStatus => {
    if (soldSeats.includes(n)) return 'sold'
    if (otherPkgSeats.includes(n)) return 'other-package'
    if (selectedSeat === n) return 'selected'
    return 'available'
  }
  const colors: Record<SeatStatus, { bg: string; border: string; text: string }> = {
    available: t.isDark
      ? { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', text: '#A1A1AA' }
      : { bg: '#F8FAFC', border: '#94A3B8', text: '#475569' },
    selected: t.isDark
      ? { bg: 'rgba(0,255,136,0.2)', border: '#00FF88', text: '#00FF88' }
      : { bg: 'rgba(37,99,235,0.12)', border: '#2563EB', text: '#2563EB' },
    sold: { bg: 'rgba(239,68,68,0.18)', border: '#EF4444', text: '#EF4444' },
    'other-package': { bg: 'rgba(245,158,11,0.15)', border: '#F59E0B', text: '#F59E0B' },
  }

  return (
    <div className="w-full">
      <div className="flex gap-3 flex-wrap justify-center lg:justify-start text-[10px] font-mono mb-3" style={{ color: t.textMuted }}>
        {(['available', 'selected', 'sold', 'other-package'] as SeatStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: colors[s].bg, border: `1px solid ${colors[s].border}` }} />
            {s === 'other-package' ? tr.booking.otherPackage : s === 'available' ? tr.booking.available : s === 'selected' ? tr.booking.selected : tr.booking.sold}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto pr-1 justify-center lg:justify-start">
        {Array.from({ length: totalSeats }, (_, i) => i + 1).map(n => {
          const status = getStatus(n)
          const c = colors[status]
          const clickable = status === 'available' || status === 'selected'
          return (
            <button
              key={n}
              onClick={() => {
                if (clickable) {
                  onSelectSeat(n)
                } else {
                  onAttemptTakenSeat?.(n)
                }
              }}
              className="w-12 h-10 rounded-lg text-[10px] font-mono transition-all duration-150"
              style={{
                background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                cursor: clickable ? 'pointer' : 'not-allowed',
                transform: status === 'selected' ? 'translateY(-1px) scale(1.06)' : 'translateY(0) scale(1)',
                boxShadow: status === 'selected'
                  ? (t.isDark ? '0 8px 18px rgba(0,255,136,0.28), 0 2px 6px rgba(0,0,0,0.35)' : '0 8px 18px rgba(37,99,235,0.2), 0 2px 6px rgba(15,23,42,0.12)')
                  : (t.isDark ? '0 4px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)' : '0 4px 10px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.8)'),
                fontWeight: 800,
                letterSpacing: '0.08em',
                textShadow: t.isDark ? 'none' : '0 0.5px 0 rgba(255,255,255,0.7)',
                opacity: t.isDark ? 1 : 0.96,
              }}
            >
              {String(n).padStart(3, '0')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function ConfettiRain() {
  const pieces = useRef(Array.from({ length: 70 }, (_, i) => ({
    id: i, color: ['#00FF88', '#8B5CF6', '#F59E0B', '#22D3EE', '#F472B6', '#FAFAFA'][i % 6],
    x: Math.random() * 100, delay: Math.random() * 3, dur: Math.random() * 2.5 + 2,
    size: Math.random() * 9 + 5, rot: Math.random() * 360, wide: Math.random() > 0.5,
  }))).current
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map(p => (
        <div key={p.id} style={{ position: 'absolute', left: `${p.x}%`, top: '-20px', width: p.wide ? p.size * 2 : p.size, height: p.size, background: p.color, borderRadius: p.wide ? '2px' : '50%', transform: `rotate(${p.rot}deg)`, animation: `confetti-fall ${p.dur}s ${p.delay}s ease-in forwards`, opacity: 0.9 }} />
      ))}
    </div>
  )
}

// ─── Booking Modal ────────────────────────────────────────────────────────────
type BStep = 'seats' | 'details' | 'payment' | 'waiting' | 'bank_waiting' | 'bank_details' | 'done' | 'declined'

// Mock sold seats and package seat ranges
const SOLD_SEATS: Record<number, number[]> = {
  0: [3, 7, 12, 15, 22, 31, 45, 67, 78, 89],
  1: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29],
  2: [1, 3, 5],
}
const OTHER_PKG_SEATS: Record<number, number[]> = {
  0: [], // General uses all seats 1-312
  1: [1, 2, 3, 4, 5], // some seats reserved for VVIP shown as other-pkg
  2: [],
}
const TOTAL_SEATS: Record<number, number> = { 0: 100, 1: 60, 2: 20 }

function BookingModal({ tier, onClose, initialStep = 'seats', previewOnly = false, recoveredState }: { tier: Omit<BookingPackage, 'id'> & { id: number; packageKey?: string }; onClose: () => void; initialStep?: BStep; previewOnly?: boolean; recoveredState?: PersistedBookingState | null }) {
  const { t } = useTheme()
  const checkoutAccent = t.isDark ? tier.accent : t.accent
  const { translations: tr, formatPrice, locale, t: translate } = useLocale()
  const { data, payments, eventId, mode } = useBooking()
  const location = useLocation()
  const navigate = useNavigate()
  const bookingRecovery = useBookingSessionRecovery()
  const [step, setStep] = useState<BStep>(() => recoveredState?.step as BStep || initialStep)
  const [selectedSeat, setSelectedSeat] = useState<number | null>(() => previewOnly ? 12 : recoveredState?.selectedSeat ?? null)
  const [info, setInfo] = useState(() => previewOnly ? { name: 'Preview Customer', email: 'preview@example.com' } : recoveredState?.info ?? { name: '', email: '' })
  const [payMethod, setPayMethod] = useState<PaymentMethod | null>(() => previewOnly ? 'paypal' : recoveredState?.payMethod as PaymentMethod | null ?? null)
  const [selectedCoin, setSelectedCoin] = useState<CryptoCoin | null>(null)
  const [proofFiles, setProofFiles] = useState<File[]>([])
  const [bankRequestId, setBankRequestId] = useState<string | null>(() => recoveredState?.bankTransferRequestId ?? null)
  const [showBankConfirmation, setShowBankConfirmation] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [reviewRecordId, setReviewRecordId] = useState<string | null>(() => recoveredState?.reviewRecordId ?? null)
  const [serverBookingId, setServerBookingId] = useState<string | null>(() => recoveredState?.bookingId ?? null)
  const [ticketId, setTicketId] = useState<string | null>(() => recoveredState?.ticketId ?? null)
  const [declineReason, setDeclineReason] = useState(() => recoveredState?.declineReason ?? (previewOnly && initialStep === 'declined' ? 'The uploaded proof could not be verified.' : ''))
  const { msg: seatMsg, show: showSeatMsg } = useToast()
  const [bookingId] = useState(() => recoveredState?.bookingReference || `APEX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
  const contentRef = useRef<HTMLDivElement>(null)
  const ticketDownloadRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const serviceFee = payments.pricing.serviceFee || 0
  const tax = tier.price * ((payments.pricing.taxPercentage || 0) / 100)
  const total = tier.price + serviceFee + tax

  const STEPS: BStep[] = ['seats', 'details', 'payment', 'waiting', 'done']
  const stepIdx = STEPS.indexOf(step)
  const STEP_LABELS = [tr.booking.seat, tr.booking.yourDetails, tr.booking.choosePayment, tr.waiting.heading, tr.done.eyebrow]

  const go = (s: BStep) => {
    if (!previewOnly && step === 'details' && s === 'payment' && info.email && eventId) void emailService.dispatchAdmin(eventId, { kind: 'booking_started', subject: 'New Booking Started', data: { Customer: info.name, Email: info.email, Event: data.hero?.title || 'Event', Package: tier.name, Seat: selectedSeat ? `Seat ${String(selectedSeat).padStart(3, '0')}` : 'TBD', Country: locale.country, Currency: locale.currency, Reference: bookingId, Time: new Date().toLocaleString() }, deepLink: `${window.location.origin}/admin/bookings` }).catch(error => showSeatMsg(error instanceof Error ? error.message : 'The booking notification could not be sent.'))
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => setStep(s), 50)
  }

  // Save session
  useEffect(() => {
    if (previewOnly) return
    const persistenceId = eventId ?? data.hero?.title ?? 'event'
    sessionPersistence.save({
      eventId: persistenceId,
      eventSlug: location.pathname.split('/').filter(Boolean).at(1),
      route: `${location.pathname}${location.search}${location.hash}`,
      packageIndex: tier.id,
      packageId: tier.packageKey ?? tier.name,
      quantity: 1,
      step,
      selectedSeat,
      info,
      locale: { country: locale.country, language: locale.bcp47, currency: locale.currency },
      payMethod: payMethod as string | null,
      selectedCoinId: selectedCoin?.id ?? recoveredState?.selectedCoinId ?? null,
      proofFileNames: proofFiles.map(file => file.name),
      proofUploadProgress: processing && proofFiles.length ? 50 : 0,
      reviewRecordId,
      bookingId: serverBookingId,
      bookingReference: bookingId,
      ticketId,
      bankTransferRequestId: bankRequestId,
      declineReason,
      scrollPosition: contentRef.current?.scrollTop ?? 0,
    })
  }, [bankRequestId, bookingId, data.hero?.title, declineReason, eventId, info, locale.bcp47, locale.country, locale.currency, location.hash, location.pathname, location.search, payMethod, previewOnly, processing, proofFiles, recoveredState?.selectedCoinId, reviewRecordId, selectedCoin, selectedSeat, serverBookingId, step, ticketId, tier.id, tier.name, tier.packageKey])

  useEffect(() => {
    if (previewOnly) return
    const persistenceId = eventId ?? data.hero?.title ?? 'event'
    return bookingRecovery.registerFlusher(`booking:${persistenceId}`, () => sessionPersistence.flush(persistenceId))
  }, [bookingRecovery, data.hero?.title, eventId, previewOnly])

  useEffect(() => {
    if (previewOnly) return
    const persistenceId = eventId ?? data.hero?.title ?? 'event'
    const markInactive = () => {
      sessionPersistence.touch(persistenceId)
      void sessionPersistence.flush(persistenceId)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') markInactive() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', markInactive)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', markInactive)
    }
  }, [data.hero?.title, eventId, previewOnly])

  useEffect(() => {
    if (previewOnly) return
    const base = location.pathname.replace(/\/(checkout|payment|booking\/[^/]+)\/?$/, '')
    const suffix = step === 'seats' || step === 'details' ? '/checkout' : step === 'done' || step === 'declined' ? `/booking/${encodeURIComponent(bookingId)}` : '/payment'
    const nextPath = `${base}${suffix}`
    if (location.pathname !== nextPath) navigate(nextPath, { replace: true })
  }, [bookingId, location.pathname, navigate, previewOnly, step])

  useEffect(() => {
    if (!recoveredState?.scrollPosition) return
    window.setTimeout(() => contentRef.current?.scrollTo({ top: recoveredState.scrollPosition, behavior: 'auto' }), 80)
  }, [recoveredState?.scrollPosition])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'done' && step !== 'declined' && step !== 'bank_waiting') onClose() }
    window.addEventListener('keydown', fn)
    // Lock background scroll (iframe-safe — no position:fixed)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('checkout-open')
    return () => {
      window.removeEventListener('keydown', fn)
      document.body.style.overflow = prev
      document.body.classList.remove('checkout-open')
    }
  }, [onClose, step])

  // Polling for payment approval
  useEffect(() => {
    if (previewOnly) return
    if (step !== 'waiting' || !reviewRecordId || !ticketId) return
    let active = true
    const check = async () => {
      try {
        const ticket = await ticketStore.findRemote(ticketId)
        if (!active || !ticket) return
        ticketStore.acceptRemote(ticket)
        if (ticket.status === 'approved') setStep('done')
        if (ticket.status === 'declined') {
          setDeclineReason(ticket.declineReason ?? 'The payment could not be approved.')
          setStep('declined')
        }
      } catch {
        // A transient polling failure is retried on the next interval.
      }
    }
    void check()
    const id = setInterval(() => void check(), 3000)
    return () => { active = false; clearInterval(id) }
  }, [step, reviewRecordId, ticketId, previewOnly])

  useEffect(() => {
    if (previewOnly) return
    if (!bankRequestId) return
    let active = true
    const check = async () => {
      try {
        const request = await bankTransferStore.refreshPublic(bankRequestId)
        if (active && (request?.status === 'bank_details_ready' || request?.status === 'transfer_window_active' || request?.status === 'payment_proof_submitted' || request?.status === 'awaiting_approval')) setStep('bank_details')
      } catch {
        // A transient polling failure is retried automatically.
      }
    }
    void check()
    const timer = setInterval(() => void check(), 3000)
    return () => { active = false; clearInterval(timer) }
  }, [bankRequestId, previewOnly])

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setProofFiles(prev => [...prev, ...selectedFiles])
      if (!previewOnly && bankRequestId && reviewRecordId) {
        setProcessing(true)
        void uploadPaymentProofs(reviewRecordId, selectedFiles, bankRequestId)
          .then(() => bankTransferStore.acceptRemote({ ...bankTransferStore.find(bankRequestId)!, status: 'payment_proof_submitted' }))
          .catch(error => showSeatMsg(error instanceof Error ? error.message : 'Payment proof upload failed.'))
          .finally(() => setProcessing(false))
      }
    }
  }

  const handleConfirm = async () => {
    if (previewOnly) { go('waiting'); return }
    if (reviewRecordId || serverBookingId) { go('waiting'); return }
    if (!eventId) {
      showSeatMsg('Publish this event before testing a live payment.')
      return
    }
    setProcessing(true)
    try {
      const checkout = await createPublicCheckout({
        eventId,
        bookingReference: bookingId,
        eventName: data.hero?.title || 'Event',
        eventBanner: data.hero?.images?.[0] || '',
        eventDate: data.hero?.date || '',
        eventTime: data.hero?.show || '8:00 PM',
        eventVenue: data.hero?.venue || '',
        eventHost: data.hero?.tour?.replace('Hosted by ', '') || data.hero?.title || '',
        customerName: info.name,
        customerEmail: info.email,
        country: locale.country,
        currency: locale.currency,
        packageName: tier.name,
        packageAccent: tier.accent,
        seatLabel: selectedSeat ? `Seat ${String(selectedSeat).padStart(3, '0')}` : 'TBD',
        benefits: tier.benefits || [],
        amount: total,
        paymentMethod: payMethod!,
        proofUrls: [],
      })
      await uploadPaymentProofs(checkout.payment.id, proofFiles)
      paymentReviewStore.acceptRemote(checkout.payment)
      ticketStore.acceptRemote(checkout.ticket)
      setReviewRecordId(checkout.payment.id)
      setServerBookingId(checkout.bookingId)
      setTicketId(checkout.ticket.id)
      go('waiting')
    } catch (error) {
      showSeatMsg(error instanceof Error ? error.message : 'Payment submission failed. Please retry.')
    } finally {
      setProcessing(false)
    }
  }

  const bankRequest = bankTransferStore.find(bankRequestId)
  const createBankTransferRequest = async () => {
    if (previewOnly) { setStep('bank_details'); return }
    if (bankRequestId || serverBookingId) { setStep(bankRequestId ? 'bank_waiting' : 'waiting'); return }
    if (!eventId) {
      showSeatMsg('Publish this event before testing a bank transfer.')
      return
    }
    setProcessing(true)
    try {
      const result = await createPublicBankTransfer({
        eventId,
        bookingReference: bookingId,
        eventName: data.hero?.title || 'Event',
        eventBanner: data.hero?.images?.[0] || '',
        eventDate: data.hero?.date || '',
        eventTime: data.hero?.show || '8:00 PM',
        eventVenue: data.hero?.venue || '',
        eventHost: data.hero?.tour?.replace('Hosted by ', '') || data.hero?.title || '',
        customerName: info.name,
        customerEmail: info.email,
        country: locale.country,
        currency: locale.currency,
        packageName: tier.name,
        packageAccent: tier.accent,
        seatLabel: selectedSeat ? `Seat ${String(selectedSeat).padStart(3, '0')}` : 'TBD',
        benefits: tier.benefits || [],
        amount: total,
        paymentMethod: 'bank_transfer',
        proofUrls: [],
      })
      bankTransferStore.acceptRemote(result.request)
      paymentReviewStore.acceptRemote(result.payment)
      ticketStore.acceptRemote(result.ticket)
      setBankRequestId(result.request.id)
      setServerBookingId(result.request.bookingId)
      setReviewRecordId(result.payment.id)
      setTicketId(result.ticket.id)
      setShowBankConfirmation(false)
      go('bank_waiting')
    } catch (error) {
      showSeatMsg(error instanceof Error ? error.message : 'Bank transfer request failed. Please retry.')
    } finally {
      setProcessing(false)
    }
  }

  const Summary = ({ glowing = false }: { glowing?: boolean }) => (
    <div className="checkout-summary rounded-2xl p-4 transition-all duration-500" style={{
      background: t.isDark ? '#0d0d0f' : t.card,
      border: `1px solid ${glowing ? checkoutAccent : t.border}`,
      boxShadow: glowing
        ? `0 0 24px -6px ${tier.accent}50, inset 0 0 12px -6px ${tier.accent}30`
        : (t.isDark ? 'none' : t.cardShadow),
    }}>
      <div className="text-sm md:text-xs font-mono uppercase tracking-wider mb-3" style={{ color: glowing ? checkoutAccent : t.textMuted }}>{tr.booking.orderSummary}</div>
      <div className="flex items-center gap-3 mb-3 pb-3 border-b" style={{ borderColor: t.border }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${checkoutAccent}12` }}>{tier.icon}</div>
        <div>
          <div className="text-base md:text-sm font-bold" style={{ color: t.text }}>{data.hero?.title}</div>
          <div className="text-sm md:text-xs" style={{ color: t.textSub }}>{data.hero?.date} · {data.hero?.show}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-base md:text-sm">
        <div className="flex justify-between"><span style={{ color: t.textSub }}>{tr.booking.package}</span><span className="font-semibold" style={{ color: t.text }}>{tier.name}</span></div>
        {selectedSeat && <div className="flex justify-between"><span style={{ color: t.textSub }}>{tr.booking.seat}</span><span className="font-mono text-sm md:text-xs" style={{ color: checkoutAccent }}>{tr.booking.seat} {String(selectedSeat).padStart(3, '0')}</span></div>}
        <div className="flex justify-between"><span style={{ color: t.textSub }}>{tr.booking.subtotal}</span><span style={{ color: t.text }}>{formatPrice(tier.price)}</span></div>
        {serviceFee > 0 && <div className="flex justify-between"><span style={{ color: t.textSub }}>{tr.booking.serviceFee}</span><span style={{ color: t.text }}>{formatPrice(serviceFee)}</span></div>}
        {tax > 0 && <div className="flex justify-between"><span style={{ color: t.textSub }}>{tr.booking.taxes}</span><span style={{ color: t.text }}>{formatPrice(tax)}</span></div>}
        <div className="flex justify-between pt-2 border-t font-bold" style={{ borderColor: t.border }}>
          <span style={{ color: t.text }}>{tr.booking.total}</span>
          <span style={{ color: checkoutAccent }}>{formatPrice(total)}</span>
        </div>
      </div>
    </div>
  )

  const StepSeats = () => (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1">
        <div className="text-base font-semibold uppercase tracking-wider mb-4 text-center lg:text-left" style={{ color: t.text, textShadow: t.isDark ? '0 2px 8px rgba(0,0,0,0.6)' : '0 1px 4px rgba(0,0,0,0.1)' }}>
          {translate('booking.selectSeatHeading', { package: tier.name, count: TOTAL_SEATS[tier.id] })}
        </div>
        <SeatGrid
          totalSeats={TOTAL_SEATS[tier.id]}
          selectedSeat={selectedSeat}
          onSelectSeat={(n) => setSelectedSeat(prev => prev === n ? null : n)}
          onAttemptTakenSeat={() => showSeatMsg(translate('booking.alreadyTaken'))}
          soldSeats={SOLD_SEATS[tier.id] || []}
          otherPkgSeats={OTHER_PKG_SEATS[tier.id] || []}
        />
        {selectedSeat && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: `${checkoutAccent}12`, border: `1px solid ${checkoutAccent}40` }}>
            <span style={{ color: checkoutAccent }}>✓</span>
            <span className="text-sm font-semibold" style={{ color: checkoutAccent }}>
              {translate('booking.seatSelected', { seat: String(selectedSeat).padStart(3, '0') })}
            </span>
          </div>
        )}
      </div>
      <div className="lg:w-64 space-y-4">
        <Summary />
        <div className="text-sm font-medium p-4 rounded-xl shadow-xl" style={{ background: t.inputBg, color: t.text, border: `1px solid ${t.border}`, textShadow: t.isDark ? '0 1px 3px rgba(0,0,0,0.5)' : 'none' }}>
          {translate('booking.oneSeat')}
        </div>
      </div>
    </div>
  )

  const StepDetails = () => (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-4">
        <div className="text-base font-semibold uppercase tracking-wider mb-2" style={{ color: t.text, textShadow: t.isDark ? '0 2px 8px rgba(0,0,0,0.6)' : '0 1px 4px rgba(0,0,0,0.1)' }}>{tr.booking.yourDetails}</div>
        {[[tr.booking.fullName, 'name', tr.booking.namePlaceholder, 'text'], [tr.booking.email, 'email', tr.booking.emailPlaceholder, 'email']].map(([label, key, placeholder, type]) => (
          <div key={key as string}>
            <label className="text-sm md:text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: t.textMuted }}>{label}</label>
            <input type={type as string} placeholder={placeholder as string} value={(info as any)[key as string]}
              onChange={e => setInfo({ ...info, [key as string]: e.target.value })}
              className="w-full px-4 py-3 rounded-xl text-base md:text-sm outline-none transition-all" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}
              onFocus={e => e.target.style.borderColor = checkoutAccent} onBlur={e => e.target.style.borderColor = t.border} />
          </div>
        ))}
        <p className="text-sm font-medium p-3 rounded-xl shadow-lg mt-4" style={{ background: `${checkoutAccent}0D`, border: `1px solid ${checkoutAccent}28`, color: t.text, textShadow: t.isDark ? '0 1px 3px rgba(0,0,0,0.5)' : 'none' }}>
          {translate('booking.ticketEmail')}
        </p>
      </div>
      <div className="lg:w-64"><Summary /></div>
    </div>
  )

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const bankTimer = 30 * 60

  // ─── Payment method definitions ─────────────────────────────────────────────
  const enabledMethods = [
    { id: 'apple_gift_card', label: 'Apple Gift Card', desc: translate('payment.appleGiftCardDescription'), badge: translate('payment.default') },
    { id: 'paypal', label: 'PayPal', desc: translate('payment.paypalDescription') },
    { id: 'cryptocurrency', label: translate('payment.cryptocurrency'), desc: translate('payment.cryptoDescription') },
    { id: 'cash_app', label: 'Cash App', desc: translate('payment.cashAppDescription') },
    { id: 'bank_transfer', label: translate('payment.bankTransfer'), desc: translate('payment.bankTransferDescription'), badge: '30 min' },
  ].filter(m => payments.methods[m.id as PaymentMethod]?.enabled && !payments.methods[m.id as PaymentMethod]?.hidden)
    .sort((a, b) => (payments.methods[a.id as PaymentMethod]?.order ?? 99) - (payments.methods[b.id as PaymentMethod]?.order ?? 99)) as { id: PaymentMethod; label: string; desc: string; badge?: string }[]

  const [showExitPopup, setShowExitPopup] = useState(false)

  const NeedHelpButton = ({ context }: { context: string }) => {
    return (
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          window.dispatchEvent(new CustomEvent('apex-open-support', { detail: { context } }))
        }}
        className="text-xs hover:underline transition-all inline-flex items-center gap-1"
        style={{ color: checkoutAccent }}
      >
        <span>{tr.booking.needHelp}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </button>
    )
  }

  const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          })
        }}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
        style={{
          background: copied ? `${checkoutAccent}20` : t.inputBg,
          color: copied ? checkoutAccent : t.textMuted,
          border: `1px solid ${copied ? `${checkoutAccent}40` : t.border}`,
          transform: copied ? 'scale(0.96)' : 'scale(1)',
        }}
      >
        {copied ? `✓ ${translate('common.copied')}` : translate('common.copy')}
      </button>
    )
  }

  const ImagePreviews = () => {
    if (proofFiles.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-3 mt-4">
        {proofFiles.map((f, i) => (
          <div key={i} className="relative group rounded-xl overflow-hidden border shrink-0" style={{ borderColor: t.border, width: 88, height: 88 }}>
            <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
              <button onClick={(e) => { e.stopPropagation(); setProofFiles(prev => prev.filter((_, j) => j !== i)); }} className="w-8 h-8 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-500 transition-colors shadow-lg">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const BankTransferRequestScreen = () => (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
      <div className="flex items-center gap-3">
        {(() => { const icon = getPaymentIcon('bank_transfer'); return icon ? <img src={icon} alt="Bank Transfer" className="h-11 w-11 rounded-xl object-contain" /> : null })()}
        <div><p className="text-xs font-mono uppercase tracking-widest" style={{ color: t.textMuted }}>{translate('payment.bankTransfer')}</p><h3 className="font-serif text-xl font-bold" style={{ color: t.text }}>{translate('payment.requestBank')}</h3></div>
      </div>
      <p className="mt-5 text-sm leading-6" style={{ color: t.textSub }}>{translate('payment.bankBody')}</p>
      <div className="mt-5 grid gap-3 rounded-xl p-4 text-sm sm:grid-cols-2" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
        {[[translate('booking.eventName'), data.hero?.title || 'Event'], [translate('booking.selectedPackage'), tier.name], [translate('booking.selectedSeat'), selectedSeat ? `${tr.booking.seat} ${String(selectedSeat).padStart(3, '0')}` : tr.common.tbd], [translate('booking.totalAmount'), formatPrice(total)], [translate('booking.customerEmail'), info.email], [translate('booking.country'), locale.country], [translate('booking.currency'), locale.currency]].map(([label, value]) => <div key={label} className="min-w-0"><div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: t.textMuted }}>{label}</div><div className="mt-1 truncate font-medium" style={{ color: t.text }}>{value}</div></div>)}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => setShowBankConfirmation(true)} className="rounded-xl px-4 py-3 text-sm font-bold" style={{ background: t.isDark ? '#00FF88' : '#2563EB', color: t.isDark ? '#08110d' : '#fff' }}>{translate('payment.requestBank')}</button><button onClick={() => setPayMethod(null)} className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}>{translate('payment.chooseAnother')}</button></div>
      {showBankConfirmation && <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: t.isDark ? '#18181B' : t.card, border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.14)' : t.cardBorder}`, boxShadow: t.isDark ? '0 24px 64px rgba(0,0,0,0.72)' : t.cardShadow }}><h3 className="font-serif text-xl font-bold" style={{ color: t.text }}>{translate('payment.confirmBank')}</h3><p className="mt-3 text-sm leading-6" style={{ color: t.textSub }}>{translate('payment.bankBody')}</p><div className="mt-6 flex gap-3"><button onClick={() => setShowBankConfirmation(false)} className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}>{translate('common.cancel')}</button><button onClick={createBankTransferRequest} className="flex-1 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: t.isDark ? '#00FF88' : t.accent, color: t.isDark ? '#08110d' : '#fff' }}>{translate('booking.continue')}</button></div></div></div>}
    </div>
  )

  const BankTransferWaitingScreen = () => (
    <div className="mx-auto max-w-2xl rounded-3xl py-8 px-5 text-center sm:p-10" style={{ background: t.isDark ? 'transparent' : t.card, border: `1px solid ${t.isDark ? 'transparent' : t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
      <div className="relative mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full" style={{ background: t.isDark ? 'rgba(16,185,129,.12)' : 'rgba(37,99,235,.1)', border: `1px solid ${t.isDark ? 'rgba(16,185,129,.35)' : 'rgba(37,99,235,.22)'}` }}><div className="h-12 w-12 animate-spin rounded-full border-4 border-transparent" style={{ borderTopColor: t.isDark ? '#34D399' : '#2563EB', borderRightColor: t.isDark ? '#34D399' : '#2563EB' }} /><div className="absolute h-4 w-4 rounded-full" style={{ background: t.isDark ? '#34D399' : '#2563EB' }} /></div>
      <p className="text-xs font-mono uppercase tracking-widest" style={{ color: t.isDark ? '#34D399' : '#2563EB' }}>{translate('payment.bankRequest')}</p><h3 className="mt-2 font-serif text-2xl font-bold sm:text-3xl" style={{ color: t.text }}>{translate('payment.awaitingBank')}</h3><p className="mx-auto mt-3 max-w-xl text-sm leading-6" style={{ color: t.textSub }}>{translate('payment.bankWaitingBody')}</p>
      <div className="mt-7 grid gap-3 rounded-2xl p-4 text-left text-sm sm:grid-cols-2" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>{[[translate('booking.reference'), bookingId], [translate('booking.eventName'), data.hero?.title || 'Event'], [tr.booking.package, tier.name], [tr.booking.seat, selectedSeat ? `${tr.booking.seat} ${String(selectedSeat).padStart(3, '0')}` : tr.common.tbd], [translate('booking.country'), locale.country], [translate('booking.currency'), locale.currency], [translate('booking.currentStatus'), translate('booking.waitingBank')]].map(([label, value]) => <div key={label}><div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: t.textMuted }}>{label}</div><div className="mt-1 font-medium" style={{ color: label === translate('booking.currentStatus') ? (t.isDark ? '#34D399' : '#2563EB') : t.text }}>{value}</div></div>)}</div>
      <p className="mt-6 text-sm font-semibold" style={{ color: t.text }}>{translate('payment.doNotClose')}</p>
    </div>
  )

  const BankTransferDetailsScreen = () => {
    const details = bankRequest?.details ?? { bankName: 'Apex Settlement Bank', accountHolder: 'Apex Event Services Ltd', accountNumber: '0214 8800 3791', routingNumber: '110000000', referenceNumber: bankRequest?.id ?? bookingId }
    const allDetails = `${details.bankName}\n${details.accountHolder}\n${details.accountNumber}\n${details.routingNumber ?? ''}\n${details.referenceNumber ?? ''}\n${formatPrice(total)} ${locale.currency}`
    const rows: Array<[string, string]> = [
      [translate('payment.bankName'), details.bankName], [translate('payment.accountHolder'), details.accountHolder],
      [translate('payment.accountNumber'), details.accountNumber], [translate('payment.routingCode'), details.routingNumber || translate('common.notRequired')],
      [translate('payment.reference'), details.referenceNumber || translate('common.notRequired')], [translate('booking.totalAmount'), formatPrice(total)],
      [translate('booking.currency'), locale.currency], [translate('payment.expirationTime'), translate('payment.availableWhenActive')],
    ]
    return <div className="mx-auto max-w-2xl space-y-4 py-2"><div className="rounded-2xl p-5" style={{ background: t.card, border: `1px solid ${t.isDark ? 'rgba(16,185,129,.35)' : t.accent}`, boxShadow: t.isDark ? 'none' : `0 14px 30px ${t.accentGlow}` }}><p className="text-xs font-mono uppercase tracking-widest" style={{ color: t.isDark ? '#34D399' : t.accent }}>{translate('payment.instructions')}</p><h3 className="mt-2 font-serif text-2xl font-bold" style={{ color: t.text }}>{translate('payment.bankAvailable')}</h3><p className="mt-2 text-sm" style={{ color: t.textSub }}>{translate('payment.bankDetailsOnly')}</p><div className="mt-5 space-y-3">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 rounded-xl p-3 text-sm" style={{ background: t.inputBg, border: `1px solid ${t.border}`, boxShadow: t.isDark ? 'none' : '0 3px 8px rgba(23,26,31,0.035)' }}><span style={{ color: t.textMuted }}>{label}</span><span className="min-w-0 truncate text-right font-mono font-semibold" style={{ color: t.text }}>{value}</span></div>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><CopyButton text={details.accountNumber} /><button onClick={() => navigator.clipboard.writeText(allDetails)} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}>{translate('payment.copyAll')}</button><button onClick={() => fileInputRef.current?.click()} className="rounded-xl px-3 py-3 text-sm font-bold" style={{ background: t.isDark ? '#00FF88' : t.accent, color: t.isDark ? '#08110d' : '#fff' }}>{translate('payment.uploadProof')}</button><button onClick={() => { setPayMethod(null); go('payment') }} className="rounded-xl px-3 py-3 text-sm font-semibold" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}>{translate('payment.chooseAnother')}</button></div><input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProofUpload} /></div></div>
  }

  const StepPayment = () => (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-4 relative">
        {showExitPopup && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 rounded-2xl" style={{ background: t.isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)' }}>
            <div className="p-5 rounded-2xl w-full max-w-sm text-center shadow-2xl" style={{ background: t.card, border: `1px solid ${checkoutAccent}`, boxShadow: t.isDark ? undefined : '0 18px 44px rgba(23,26,31,0.2)', animation: 'fade-in-up 0.25s ease' }}>
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3" style={{ background: `${checkoutAccent}12`, color: checkoutAccent }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h4 className="font-bold mb-2" style={{ color: t.text }}>{translate('payment.needHelpTitle')}</h4>
              <p className="text-xs mb-5" style={{ color: t.textSub }}>{translate('payment.needHelpBody')}</p>
              <div className="flex gap-3">
                <button onClick={() => { setShowExitPopup(false); setPayMethod(null); if (payMethod !== 'cryptocurrency') setSelectedCoin(null) }} className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}>
                  {translate('booking.back')}
                </button>
                <button onClick={() => { setShowExitPopup(false); window.dispatchEvent(new CustomEvent('apex-open-support', { detail: { context: enabledMethods.find(m => m.id === payMethod)?.label || 'Payment' } })) }} className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors" style={{ background: checkoutAccent, color: t.isDark ? '#09090B' : '#FFFFFF' }}>
                  {translate('payment.getHelp')}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Payment method selector ── */}
        {!payMethod && (
          <div style={{ animation: 'fade-in-up 0.25s ease' }}>
            <div className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: t.textMuted }}>{tr.booking.choosePayment}</div>
            <div className="space-y-2.5">
              {enabledMethods.map(m => (
                <PaymentMethodCard
                  key={m.id}
                  methodId={m.id}
                  label={m.label}
                  description={m.desc}
                  isSelected={false}
                  accentColor={checkoutAccent}
                  badge={m.badge}
                  onClick={() => { setPayMethod(m.id); if (m.id !== 'cryptocurrency') setSelectedCoin(null) }}
                  iconOverride={m.id === 'apple_gift_card' ? '/apple-gift-card.png' : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Dedicated Payment Views ── */}
        {payMethod === 'bank_transfer' && <BankTransferRequestScreen />}
        {payMethod && payMethod !== 'bank_transfer' && (
          <div style={{ animation: 'fade-in-up 0.3s ease' }} className="space-y-4">
            <button
              onClick={() => setShowExitPopup(true)}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 mb-2"
              style={{ color: tier.accent }}
            >
              ← {translate('payment.chooseAnother')}
            </button>

        {/* ── Apple Gift Card detail ── */}
        {payMethod === 'apple_gift_card' && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
            <div className="flex justify-center py-4">
              <img
                src="/apple-gift-card.png"
                alt="Apple Gift Card"
                className="w-56 drop-shadow-[0_20px_40px_rgba(37,99,235,0.25)] transition-transform hover:scale-105 hover:-translate-y-1 duration-300"
                style={{ animation: 'float 6s ease-in-out infinite' }}
              />
            </div>
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: t.textMuted }}>{tr.booking.paymentInstructions}</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: t.textSub }}>
              {payments.methods.apple_gift_card?.instructions || tr.booking.paymentInstructions}
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: t.textMuted }}>{tr.booking.uploadProof}</div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProofUpload} />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full py-10 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors"
                style={{ borderColor: proofFiles.length > 0 ? tier.accent : t.border, background: proofFiles.length > 0 ? `${tier.accent}08` : 'transparent' }}>
                <span className="text-3xl">{proofFiles.length > 0 ? '✅' : <img src="/icons/upload-file.gif" alt="Upload" className="w-10 h-10 object-contain" />}</span>
                <span className="text-sm" style={{ color: proofFiles.length > 0 ? tier.accent : t.textMuted }}>
                  {proofFiles.length > 0 ? tr.booking.filesSelected.replace('{count}', String(proofFiles.length)) : tr.booking.tapToUpload}
                </span>
              </button>
              <ImagePreviews />
              <div className="mt-3">
                <NeedHelpButton context="Apple Gift Card" />
              </div>
            </div>
          </div>
        )}

        {/* ── PayPal detail ── */}
        {payMethod === 'paypal' && (
          <div className="rounded-2xl p-5 space-y-3" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
              {(() => { const icon = getPaymentIcon('paypal'); return icon ? <img src={icon} alt="PayPal" className="w-8 h-8 object-contain" /> : <span className="text-2xl">🅿️</span>; })()}
              <div className="flex-1 min-w-0">
                <div className="text-xs" style={{ color: t.textMuted }}>{tr.booking.sendTo.replace('{amount}', formatPrice(total))}</div>
                <div className="font-mono text-sm font-bold truncate select-all" style={{ color: t.text }}>{payments.methods.paypal?.destination || 'payments@apexbookings.com'}</div>
              </div>
              <CopyButton text={payments.methods.paypal?.destination || 'payments@apexbookings.com'} />
            </div>
            <p className="text-xs whitespace-pre-wrap" style={{ color: t.textMuted }}>{payments.methods.paypal?.instructions || tr.booking.paymentInstructions}</p>
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProofUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 rounded-xl border-dashed border text-sm" style={{ borderColor: proofFiles.length > 0 ? tier.accent : t.border, color: proofFiles.length > 0 ? tier.accent : t.textMuted }}>
              {proofFiles.length > 0 ? tr.booking.filesSelected.replace('{count}', String(proofFiles.length)) : <span className="inline-flex items-center gap-1.5"><img src="/icons/upload-file.gif" alt="Upload" className="w-5 h-5 object-contain" /> {tr.booking.uploadProof}</span>}
            </button>
            <ImagePreviews />
            <div className="mt-3">
              <NeedHelpButton context="PayPal" />
            </div>
          </div>
        )}

        {/* ── Cryptocurrency detail: step 1 = selector, step 2 = payment detail ── */}
        {payMethod === 'cryptocurrency' && !selectedCoin && (
          <div className="rounded-2xl p-5" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
            <CryptoSelector accentColor={checkoutAccent} cryptocurrencies={payments.cryptocurrencies} onSelect={setSelectedCoin} />
          </div>
        )}
        {payMethod === 'cryptocurrency' && selectedCoin && (
          <div className="rounded-2xl p-5" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
            <p className="text-xs whitespace-pre-wrap mb-4" style={{ color: t.textMuted }}>{payments.methods.cryptocurrency?.instructions || tr.booking.paymentInstructions}</p>
            <CryptoPaymentDetail
              coin={selectedCoin}
              amount={total}
              accentColor={checkoutAccent}
              onBack={() => setSelectedCoin(null)}
              fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
              proofFiles={proofFiles}
              onUploadClick={() => fileInputRef.current?.click()}
            />
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProofUpload} />
            <ImagePreviews />
            <div className="mt-3">
              <NeedHelpButton context="Cryptocurrency" />
            </div>
          </div>
        )}

        {/* ── Cash App detail ── */}
        {payMethod === 'cash_app' && (
          <div className="rounded-2xl p-5 space-y-3" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
              {(() => { const icon = getPaymentIcon('cash_app'); return icon ? <img src={icon} alt="Cash App" className="w-8 h-8 object-contain" style={{ transform: 'scale(1.4)' }} /> : <span className="text-2xl">💚</span>; })()}
              <div className="flex-1 min-w-0">
                <div className="text-xs" style={{ color: t.textMuted }}>{tr.booking.sendTo.replace('{amount}', formatPrice(total))}</div>
                <div className="font-mono text-lg font-bold truncate select-all" style={{ color: '#00D482' }}>{payments.methods.cash_app?.destination || '$ApexEvents'}</div>
              </div>
              <CopyButton text={payments.methods.cash_app?.destination || '$ApexEvents'} />
            </div>
            <p className="text-xs whitespace-pre-wrap" style={{ color: t.textMuted }}>{payments.methods.cash_app?.instructions || tr.booking.paymentInstructions}</p>
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProofUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 rounded-xl border-dashed border text-sm" style={{ borderColor: proofFiles.length > 0 ? tier.accent : t.border, color: proofFiles.length > 0 ? tier.accent : t.textMuted }}>
              {proofFiles.length > 0 ? tr.booking.filesSelected.replace('{count}', String(proofFiles.length)) : <span className="inline-flex items-center gap-1.5"><img src="/icons/upload-file.gif" alt="Upload" className="w-5 h-5 object-contain" /> {tr.booking.uploadProof}</span>}
            </button>
            <ImagePreviews />
            <div className="mt-3">
              <NeedHelpButton context="Cash App" />
            </div>
          </div>
        )}

        {/* ── Bank Transfer detail ── */}
        {String(payMethod) === 'bank_transfer' && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => { const icon = getPaymentIcon('bank_transfer'); return icon ? <img src={icon} alt="Bank Transfer" className="w-6 h-6 object-contain" /> : null; })()}
                <div className="text-xs font-mono uppercase tracking-wider" style={{ color: t.textMuted }}>Bank Transfer Details</div>
              </div>
              <div className={`font-mono text-sm font-bold px-3 py-1 rounded-lg ${bankTimer < 300 ? 'animate-pulse' : ''}`}
                style={{ background: bankTimer < 300 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: bankTimer < 300 ? '#EF4444' : '#F59E0B' }}>
                ⏱ {fmtTime(bankTimer)}
              </div>
            </div>
            {bankTimer === 0 ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">⌛</div>
                <div className="font-semibold text-sm mb-1" style={{ color: '#EF4444' }}>Transfer window expired</div>
                <div className="text-xs" style={{ color: t.textMuted }}>This payment session has expired.</div>
              </div>
            ) : (
              <>
                <div className="space-y-4 text-sm">
                  <div className="whitespace-pre-wrap leading-relaxed" style={{ color: t.textSub }}>
                    {payments.methods.bank_transfer?.instructions || tr.booking.paymentInstructions}
                  </div>
                  <div className="flex items-center gap-2 p-4 rounded-xl font-mono" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
                    <div className="flex-1 min-w-0 whitespace-pre-wrap text-sm leading-relaxed select-all" style={{ color: t.text }}>
                      {payments.methods.bank_transfer?.destination || 'Apex Bookings\nAccount: 0123456789'}
                    </div>
                    <CopyButton text={payments.methods.bank_transfer?.destination || 'Apex Bookings\nAccount: 0123456789'} />
                  </div>
                  <div className="flex justify-between py-2 border-t font-semibold" style={{ borderColor: t.border, color: t.text }}>
                    <span>{tr.booking.total}</span>
                    <span className="font-mono">{formatPrice(total)}</span>
                  </div>
                </div>
                <p className="text-xs" style={{ color: '#F59E0B' }}>⚠️ {tr.booking.important}</p>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProofUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 rounded-xl border-dashed border text-sm" style={{ borderColor: proofFiles.length > 0 ? tier.accent : t.border, color: proofFiles.length > 0 ? tier.accent : t.textMuted }}>
                  {proofFiles.length > 0 ? tr.booking.filesSelected.replace('{count}', String(proofFiles.length)) : <span className="inline-flex items-center gap-1.5"><img src="/icons/upload-file.gif" alt="Upload" className="w-5 h-5 object-contain" /> {tr.booking.uploadProof}</span>}
                </button>
                <ImagePreviews />
                <div className="mt-3">
                  <NeedHelpButton context="Bank Transfer" />
                </div>
              </>
            )}
          </div>
        )}
          </div>
        )}
      </div>
      <div className="lg:w-64 space-y-3">
        <Summary glowing={true} />
        <div className="text-xs p-3 rounded-xl" style={{ background: t.inputBg, color: t.textMuted, border: `1px solid ${t.border}` }}>
          🔒 {tr.booking.paymentRef}
        </div>
      </div>
    </div>
  )

  // Waiting screen
  const StepWaiting = () => (
    <div className="mx-auto max-w-2xl rounded-3xl px-5 py-8 text-center sm:p-10" style={{ background: t.isDark ? 'transparent' : t.card, border: `1px solid ${t.isDark ? 'transparent' : t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
      <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <img src={hourglassIcon} alt="Waiting" className="w-16 h-16 object-contain" style={{ mixBlendMode: t.isDark ? 'screen' : 'normal', filter: t.isDark ? 'none' : 'drop-shadow(0 5px 10px rgba(146,64,14,0.2)) saturate(1.15) contrast(1.08)' }} />
      </div>
      <div className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#F59E0B' }}>{tr.waiting.eyebrow}</div>
      <h3 className="font-serif text-2xl font-bold mb-3" style={{ color: t.text }}>{tr.waiting.heading}</h3>
      <p className="text-sm leading-relaxed mb-2 max-w-sm mx-auto" style={{ color: t.textSub }}>
        {tr.waiting.subheading}
      </p>
      <p className="text-sm mb-8" style={{ color: t.textSub }}>
        {tr.waiting.waitMessage}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-sm" style={{ background: `${checkoutAccent}12`, border: `1px solid ${checkoutAccent}`, color: checkoutAccent, boxShadow: t.isDark ? 'none' : `0 6px 14px ${t.accentGlow}` }}>
          📋 Close and check email
        </button>
        <button onClick={onClose} className="px-6 py-3 rounded-2xl font-semibold text-sm" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.textSub }}>
          🏠 {tr.booking.closeReturn}
        </button>
      </div>
      <div className="mt-8 p-4 rounded-2xl max-w-sm mx-auto transition-shadow duration-500" style={{ background: t.inputBg, border: `1px solid ${t.border}`, boxShadow: t.isDark ? `0 0 24px ${tier.glow}` : '0 8px 18px rgba(23,26,31,0.06)' }}>
        <div className="text-xs font-mono mb-2" style={{ color: t.textMuted }}>{tr.waiting.refId}</div>
        <div className="font-mono text-sm font-bold" style={{ color: checkoutAccent }}>{bookingId}</div>
        <div className="text-xs mt-1" style={{ color: t.textMuted }}>{tr.booking.paymentRef}</div>
      </div>
    </div>
  )

  const currentTicket = ticketId ? ticketStore.findById(ticketId) : null
  const ticketRefUrl = currentTicket ? `${window.location.origin}/ticket/${currentTicket.qrToken ?? currentTicket.id}` : ''

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Ticket', text: 'I just booked my ticket!', url: ticketRefUrl })
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(ticketRefUrl)
      showSeatMsg(tr.toast.linkCopied)
    }
  }

  const handleDownload = async () => {
    if (!ticketDownloadRef.current) return
    try {
      const { toPng } = await import('html-to-image')
      const image = await toPng(ticketDownloadRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: t.isDark ? '#111113' : '#FFFFFF' })
      const link = document.createElement('a')
      link.download = `apex-ticket-${currentTicket?.ticketNumber || bookingId}.png`
      link.href = image
      link.click()
      showSeatMsg(tr.toast.downloaded)
    } catch {
      showSeatMsg('Ticket image could not be downloaded. Please try again.')
    }
  }

  const StepDone = () => (
    <div className="text-center py-6 relative">
      <ConfettiRain />
      <div className="relative z-10">
        <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'transparent', animation: 'pulse-glow 2s ease-in-out infinite', '--glow-color': t.isDark ? 'rgba(0,255,136,0.3)' : 'rgba(37,99,235,0.25)' } as React.CSSProperties}>
          <img src={verifiedHeroIcon} alt="Verified" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(0,255,136,0.4)]" />
        </div>
        <div className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: t.isDark ? '#00FF88' : '#2563EB' }}>{tr.done.eyebrow}</div>
        <h3 className="font-serif text-3xl font-bold mb-2" style={{ color: t.text }}>{tr.done.heading} {data.hero?.title || ''}</h3>
        <p className="text-sm mb-8" style={{ color: t.textSub }}>{tr.done.subtitle.replace('{email}', info.email || 'your email')}</p>
        
        <div ref={ticketDownloadRef} className="premium-issued-ticket max-w-md mx-auto overflow-hidden relative" style={{ '--ticket-accent': tier.accent, background: t.isDark ? 'linear-gradient(145deg,#111113,#1a1a1f)' : t.card, border: `1px solid ${t.isDark ? `${tier.accent}55` : t.accent}`, boxShadow: t.isDark ? `0 28px 80px ${tier.glow}` : `0 24px 60px ${t.accentGlow}` } as React.CSSProperties}>
          <div className="premium-ticket-banner h-40 relative">
            <img src={data.hero?.images?.[0] || ''} alt={data.hero?.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111113] to-transparent opacity-90" />
            <div className="absolute bottom-4 left-5 right-5 text-left">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: tier.accent }}>{data.hero?.tour?.replace('Hosted by ', '') || data.hero?.title} {tr.done.presents}</div>
              <div className="font-serif text-xl font-bold leading-tight" style={{ color: '#FFFFFF' }}>{data.hero?.title}</div>
            </div>
          </div>
          <div className="premium-ticket-body relative p-6 text-left" style={{ background: t.isDark ? 'transparent' : t.card }}>
            <div className="mb-5 flex items-center justify-between gap-3"><img src="/apex-email-ticket-logo.png" alt="Apex Bookings" className="h-12 w-auto rounded-lg bg-black object-cover object-center" /><span className="premium-ticket-seal rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em]">Verified digital pass</span></div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{tr.done.customerName}</div>
                <div className="font-bold text-lg" style={{ color: t.isDark ? '#FFFFFF' : t.text }}>{currentTicket?.customerName || info.name || 'Alex Morgan'}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{tr.done.ticketNo}</div>
                <div className="font-mono text-xs font-bold" style={{ color: checkoutAccent }}>{currentTicket?.ticketNumber || 'TKT-XXXX-XXXX'}</div>
              </div>
            </div>
            
            <div className="premium-ticket-details grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{tr.done.dateTime}</div>
                <div className="text-sm font-semibold" style={{ color: t.isDark ? '#FFFFFF' : t.text }}>{data.hero?.date}</div>
                <div className="text-xs mt-0.5" style={{ color: t.textSub }}>{data.hero?.show}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{tr.done.venue}</div>
                <div className="text-sm font-semibold" style={{ color: t.isDark ? '#FFFFFF' : t.text }}>{data.hero?.venue}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{tr.booking.package}</div>
                <div className="text-sm font-bold" style={{ color: checkoutAccent }}>{tier.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{tr.booking.seat}</div>
                <div className="text-sm font-bold" style={{ color: t.isDark ? '#FFFFFF' : t.text }}>{selectedSeat ? `Seat ${String(selectedSeat).padStart(3, '0')}` : 'TBD'}</div>
              </div>
            </div>

            {tier.benefits && tier.benefits.length > 0 && (
              <div className="premium-ticket-benefits mb-6 p-4 rounded-2xl" style={{ background: t.isDark ? 'rgba(0,0,0,0.4)' : t.inputBg, border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.05)' : t.border}` }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: t.textMuted }}>{tr.done.includedBenefits}</div>
                <ul className="text-xs space-y-1.5" style={{ color: t.isDark ? '#D4D4D8' : t.textSub }}>
                  {tier.benefits.map((b: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span style={{ color: checkoutAccent }}>✦</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center mb-4">
              <div className="premium-ticket-qr bg-white p-3 rounded-2xl flex items-center justify-center">
                <QRCodeSVG
                  value={ticketRefUrl}
                  size={120}
                  bgColor="#FFFFFF"
                  fgColor="#09090B"
                  level="H"
                  includeMargin={false}
                  className="rounded-lg"
                />
              </div>
            </div>
            <div className="text-center text-[10px] font-mono" style={{ color: t.textMuted }}>
              {tr.done.scanEntry}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 justify-center mt-6">
          <button onClick={handleDownload} className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all hover:scale-105" style={{ background: checkoutAccent, color: t.isDark ? '#09090B' : '#FFFFFF', boxShadow: t.btnShadow }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {tr.done.downloadTicket}
          </button>
          <button onClick={handleShare} className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all hover:scale-105" style={{ background: t.isDark ? 'rgba(255,255,255,0.06)' : t.card, border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.1)' : t.border}`, color: t.text, boxShadow: t.btnShadow }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
            {tr.done.shareTicket}
          </button>
        </div>
      </div>
    </div>
  )

  const StepDeclined = () => (
    <div className="mx-auto max-w-xl rounded-3xl px-5 py-8 text-center sm:p-10" style={{ background: t.isDark ? 'transparent' : t.card, border: `1px solid ${t.isDark ? 'transparent' : '#F5C2C7'}`, boxShadow: t.isDark ? 'none' : '0 12px 28px rgba(127,29,29,0.08)' }}>
      <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid #EF4444' }}>
        <span className="text-4xl">❌</span>
      </div>
      <div className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#EF4444' }}>{tr.declined.eyebrow}</div>
      <h3 className="font-serif text-2xl font-bold mb-3" style={{ color: t.text }}>{tr.declined.heading}</h3>
      <p className="text-sm leading-relaxed mb-6 max-w-sm mx-auto" style={{ color: t.textSub }}>
        {tr.declined.subheading}
        {declineReason && <span className="block mt-2 font-bold" style={{ color: t.text }}>{tr.declined.reason} {declineReason}</span>}
      </p>
      
      <div className="flex flex-col gap-3 max-w-xs mx-auto">
        <button onClick={() => setStep('payment')} className="px-6 py-3.5 rounded-2xl font-bold text-sm w-full" style={{ background: t.isDark ? '#EF4444' : '#DC2626', color: '#FFFFFF' }}>
          📤 {tr.declined.uploadNew}
        </button>
        <button onClick={() => { setPayMethod(null); setStep('payment'); }} className="px-6 py-3.5 rounded-2xl font-semibold text-sm w-full" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, boxShadow: t.isDark ? 'none' : '0 4px 10px rgba(23,26,31,0.04)' }}>
          💳 {tr.declined.chooseAnother}
        </button>
        <button onClick={onClose} className="text-xs hover:underline mt-2" style={{ color: t.textMuted }}>
          {tr.booking.closeReturn}
        </button>
      </div>
    </div>
  )

  const canAdvance = (step === 'seats' && selectedSeat !== null) || (step === 'details' && !!info.name && !!info.email) || step === 'payment'
  const submitDisabled = processing || proofFiles.length === 0 || (payMethod === 'bank_transfer' && bankTimer === 0)

  return (
    <>
    <div className="booking-checkout fixed inset-0 z-[9998] flex items-end md:items-center justify-center p-0 md:p-4" style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}>
      <div className="checkout-surface ios-modal-scroll w-full md:max-w-5xl flex flex-col rounded-t-3xl md:rounded-3xl"
        style={{ background: t.isDark ? '#111113' : t.bg, height: '95dvh', maxHeight: '95dvh', overflow: 'hidden', animation: 'modal-in 0.35s cubic-bezier(0.16,1,0.3,1)', border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.08)' : t.border}`, boxShadow: t.isDark ? '0 40px 80px rgba(0,0,0,0.6)' : '0 24px 60px rgba(23,26,31,0.14)' }}>
        <div className="checkout-header flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: t.border, background: t.isDark ? '#111113' : '#FFFFFF' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${tier.accent}18`, border: `1px solid ${tier.accent}40` }}>{tier.icon}</div>
            <div>
              <div className="font-serif font-bold text-sm" style={{ color: t.text }}>{tr.tickets.bookNow} {tier.name}</div>
              <div className="text-xs" style={{ color: t.textMuted }}>{data.hero?.title} · {data.hero?.venue} · {data.hero?.date}</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            {STEP_LABELS.slice(0, 3).map((label, i) => {
              const done = i < stepIdx
              const active = i === stepIdx
              const doneColor = t.isDark ? '#00FF88' : '#2563EB'
              const doneText = t.isDark ? '#09090B' : '#FFFFFF'
              return (
                <div key={label} className="flex items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{ background: done ? doneColor : active ? `${t.accent}22` : t.inputBg, border: `1.5px solid ${done ? doneColor : active ? t.accent : t.border}`, color: done ? doneText : active ? t.accent : t.textMuted }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className="text-xs hidden lg:inline" style={{ color: active ? t.textSub : t.textMuted }}>{label}</span>
                  </div>
                  {i < 2 && <div className="w-6 h-px" style={{ background: done ? doneColor : t.border }} />}
                </div>
              )
            })}
          </div>
          {step !== 'done' && step !== 'bank_waiting' && (
            <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors" style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.textMuted }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <div
          ref={contentRef}
          className="checkout-content flex-1 min-h-0 p-6"
          style={{
            background: t.isDark ? 'transparent' : t.bg2,
            overflowY: 'scroll',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          {step === 'seats' && StepSeats()}
          {step === 'details' && StepDetails()}
          {step === 'payment' && StepPayment()}
          {step === 'waiting' && StepWaiting()}
          {step === 'bank_waiting' && BankTransferWaitingScreen()}
          {step === 'bank_details' && BankTransferDetailsScreen()}
          {step === 'done' && StepDone()}
          {step === 'declined' && StepDeclined()}
        </div>
        
        {/* Admin Preview Debug Panel */}
        {data && mode !== 'published' && (
          <div className="absolute top-20 right-6 flex items-center gap-2 p-2 rounded-xl backdrop-blur-md shadow-2xl z-50 border" style={{ background: 'rgba(0,0,0,0.72)', borderColor: 'rgba(255,255,255,0.12)' }}>
            <span className="text-[10px] font-mono text-zinc-400 px-2 uppercase">Preview</span>
            <button onClick={() => go('waiting')} className="px-2 py-1 text-[10px] rounded hover:bg-white/10 text-zinc-300">Wait</button>
            <button onClick={() => { if (!previewOnly && bankRequestId) bankTransferStore.markReady(bankRequestId); go('bank_details') }} className="px-2 py-1 text-[10px] rounded hover:bg-white/10 text-sky-300">Bank details</button>
            <button onClick={() => go('done')} className="px-2 py-1 text-[10px] rounded hover:bg-white/10 text-zinc-300">Done</button>
            <button onClick={() => { setDeclineReason('Simulated network error'); go('declined') }} className="px-2 py-1 text-[10px] rounded hover:bg-white/10 text-red-400">Decline</button>
          </div>
        )}
        {step !== 'done' && step !== 'waiting' && step !== 'bank_waiting' && step !== 'bank_details' && step !== 'declined' && !(step === 'payment' && payMethod === 'bank_transfer') && (
          <div className="checkout-footer flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: t.border, background: t.isDark ? '#0d0d0f' : '#FFFFFF' }}>
            <div>
              {stepIdx > 0
                ? <button onClick={() => { if (step === 'payment' && payMethod !== null) { setShowExitPopup(true) } else { go(STEPS[stepIdx - 1] as BStep) } }} className="flex items-center gap-2 text-sm transition-colors" style={{ color: t.textSub }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>
                  {tr.booking.back}
                </button>
                : <div className="text-xs" style={{ color: t.textMuted }}>{tr.booking.stepOf.replace('{step}', String(stepIdx + 1)).replace('{total}', '3')}</div>
              }
            </div>
            {step === 'payment'
              ? <button onClick={handleConfirm} disabled={submitDisabled} className="flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm"
                style={{ background: submitDisabled ? (t.isDark ? 'rgba(0,255,136,0.08)' : 'rgba(37,99,235,0.3)') : (t.isDark ? 'rgba(0,255,136,0.18)' : 'linear-gradient(135deg,#2563EB,#1D4ED8)'), color: t.isDark ? '#00FF88' : '#FFFFFF', border: t.isDark ? '1px solid rgba(0,255,136,0.4)' : 'none', cursor: submitDisabled ? 'not-allowed' : 'pointer', boxShadow: submitDisabled ? 'none' : (t.isDark ? '0 8px 24px rgba(0,255,136,0.25)' : '0 4px 20px rgba(37,99,235,0.3)'), minWidth: 180 }}>
                {processing
                  ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{tr.booking.processing}</>
                  : tr.booking.submitProof.replace('{amount}', formatPrice(total))
                }
              </button>
              : <button disabled={!canAdvance} onClick={() => canAdvance && go(STEPS[stepIdx + 1] as BStep)} className="flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm md:text-base transition-all hover:-translate-y-1"
                style={{ background: canAdvance ? (t.isDark ? `${tier.accent}18` : `linear-gradient(135deg,${t.accent},${t.accentDim})`) : t.inputBg, color: canAdvance ? (t.isDark ? tier.accent : '#FFFFFF') : t.textMuted, border: canAdvance && t.isDark ? `1px solid ${tier.accent}40` : 'none', cursor: canAdvance ? 'pointer' : 'not-allowed', boxShadow: canAdvance ? (t.isDark ? `0 8px 24px ${tier.glow}` : `0 4px 16px ${t.accentGlow}`) : t.btnShadow }}>
                {tr.common.continue} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            }
          </div>
        )}
        {step === 'done' && (
          <div className="px-6 pb-6 text-center shrink-0">
            <button onClick={() => { sessionPersistence.clear(eventId ?? data.hero?.title ?? 'event'); onClose() }} className="text-sm transition-colors" style={{ color: t.textMuted }}>{tr.done.closeReturn}</button>
          </div>
        )}
      </div>
    </div>
    <Toast msg={seatMsg} />
    </>
  )
}

// ─── Ticket Section ───────────────────────────────────────────────────────────
function TicketSection() {
  const { t } = useTheme()
  const { translations: tr, formatPrice, t: translate } = useLocale()
  const { data, mode, previewState, simulationOnly, eventId } = useBooking()
  const location = useLocation()
  const navigate = useNavigate()
  const bookingRecovery = useBookingSessionRecovery()
  const initialBookingPath = useRef(location.pathname).current
  const [modalTier, setModalTier] = useState<number | null>(null)
  const [recoveredState, setRecoveredState] = useState<PersistedBookingState | null>(null)
  const [expiredState, setExpiredState] = useState<PersistedBookingState | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const tiers = data.packages.map((tier, id) => ({ ...tier, packageKey: tier.id, id }))
  const prices = tiers.map(tier => tier.price)
  const lowestPrice = Math.min(...prices)
  const highestPrice = Math.max(...prices)

  const previewStep: BStep = previewState === 'checkout' ? 'details'
    : previewState === 'payment-pending' ? 'payment'
      : previewState === 'awaiting-bank-details' ? 'bank_waiting'
        : previewState === 'payment-submitted' ? 'waiting'
          : previewState === 'payment-approved' || previewState === 'ticket-confirmation' ? 'done'
            : previewState === 'payment-declined' ? 'declined' : 'seats'

  useEffect(() => {
    if (mode !== 'editor') return
    if (previewState === 'page') setModalTier(null)
    else if (previewState === 'packages') {
      setModalTier(null)
      window.setTimeout(() => document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    } else setModalTier(0)
  }, [mode, previewState])

  useEffect(() => {
    if (mode !== 'published') return
    const persistenceId = eventId ?? data.hero?.title ?? 'event'
    let active = true
    const restore = () => void sessionPersistence.loadRemote(persistenceId).then(result => {
      if (!active) return
      if (result.status === 'active') {
        const packageIndex = Math.min(Math.max(0, result.state.packageIndex), Math.max(0, tiers.length - 1))
        setRecoveredState(result.state)
        setExpiredState(null)
        setSessionExpired(false)
        setModalTier(packageIndex)
        bookingRecovery.notifyRestored()
      } else if (result.status === 'expired') {
        setExpiredState(result.state)
        setSessionExpired(true)
        setRecoveredState(null)
        setModalTier(null)
      } else if (/\/(checkout|payment|booking\/)/.test(initialBookingPath)) {
        setSessionExpired(true)
      }
    }).catch(() => undefined)
    restore()
    window.addEventListener('apex:booking-resume-check', restore)
    return () => { active = false; window.removeEventListener('apex:booking-resume-check', restore) }
  }, [data.hero?.title, eventId, initialBookingPath, mode, tiers.length])

  const closeBooking = () => {
    setModalTier(null)
    setRecoveredState(null)
    const base = location.pathname.replace(/\/(checkout|payment|booking\/[^/]+)\/?$/, '')
    if (location.pathname !== base) navigate(base, { replace: true })
  }

  if (!data.visibility.tickets && mode !== 'editor') return null
  return (
    <EditableTarget target={{ section: 'tickets' }}><section id="tickets" className={`booking-section premium-tickets py-24 px-6 relative overflow-hidden ${!data.visibility.tickets ? 'opacity-40' : ''}`} style={{ background: t.isDark ? t.bg : t.bg2 }}>
      <div className="max-w-6xl mx-auto">
        <LocalizedTicketHeading />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 reveal">
          {tiers.map((tier, index) => {
            const visualAccent = t.isDark ? tier.accent : t.accent
            const visualGlow = t.isDark ? tier.glow : t.accentGlow
            const valueLevel = highestPrice === lowestPrice ? 0 : (tier.price - lowestPrice) / (highestPrice - lowestPrice)
            const isPremium = !t.isDark && valueLevel >= 0.75
            const isElevated = !t.isDark && valueLevel >= 0.35
            return (
            <EditableTarget key={tier.id} target={{ section: 'tickets', index }}><div onClick={() => { if (mode !== 'editor') setModalTier(tier.id) }}
              className="ticket-tier-card relative rounded-3xl p-7 cursor-pointer flex flex-col items-center text-center transition-all duration-300 group"
              style={{ background: t.isDark ? t.card : isPremium ? 'linear-gradient(145deg,#FFFFFF 0%,#EEF4FF 100%)' : isElevated ? 'linear-gradient(145deg,#FFFFFF 0%,#F7F9FF 100%)' : t.card, border: `1px solid ${t.isDark ? t.cardBorder : isPremium ? t.accent : isElevated ? `${t.accent}70` : t.cardBorder}`, boxShadow: t.isDark ? t.cardShadow : isPremium ? `0 16px 32px ${t.accentGlow}` : isElevated ? `0 10px 24px rgba(23,26,31,0.07)` : t.cardShadow }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-5px)'; (e.currentTarget as HTMLDivElement).style.borderColor = visualAccent; (e.currentTarget as HTMLDivElement).style.boxShadow = t.isDark ? `0 0 40px ${tier.glow}, 0 20px 60px rgba(0,0,0,0.3)` : `0 12px 28px ${visualGlow}` }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.borderColor = t.cardBorder; (e.currentTarget as HTMLDivElement).style.boxShadow = t.cardShadow }}>
              <div className="package-card-badge-slot">
                {tier.badge && (
                  <div className="package-card-badge inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[10px] font-extrabold uppercase tracking-[.12em]" title={tier.badge} style={{ background: visualAccent, color: t.isDark ? '#09090B' : '#FFFFFF', boxShadow: `0 8px 24px ${visualGlow}` }}><span aria-hidden="true">✦</span><span className="truncate">{tier.badge}</span></div>
                )}
              </div>
              <div className="flex flex-col items-center justify-center text-center gap-2 mb-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-1" style={{ background: `${visualAccent}12`, border: `1px solid ${visualAccent}26` }}>{tier.icon}</div>
                <div>
                  <div className="font-serif text-xl font-bold" style={{ color: t.text }}>{tier.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: t.textSub }}>{tier.desc}</div>
                </div>
              </div>
              <div className="mb-2 inline-flex items-center justify-center rounded-2xl px-4 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.65)]" style={{ background: t.isDark ? 'rgba(255,255,255,0.06)' : t.inputBg, border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.12)' : t.border}` }}>
                <span className="font-serif font-bold" style={{ color: visualAccent, fontSize: isPremium ? '2.9rem' : isElevated ? '2.65rem' : '2.4rem', textShadow: t.isDark ? 'none' : '0 1px 0 rgba(255,255,255,0.7)' }}>{formatPrice(tier.price)}</span>
                <span className="text-sm ml-1" style={{ color: t.textMuted }}>{tr.tickets.perTicket}</span>
              </div>
              <div className="text-xs font-mono mb-4 text-center" style={{ color: tier.seats < 20 ? '#EF4444' : t.textMuted }}><AnimatedMetric value={tier.seats} /> {tr.tickets.seatsRemaining}</div>
              <div className="w-full h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: t.isDark ? t.border : '#F3F4F6' }}>
                <div className="h-full rounded-full" style={{ width: `${100 - (tier.seats / 400) * 100}%`, background: visualAccent }} />
              </div>
              <ul className="space-y-2.5 mb-6 flex-1 w-full flex flex-col items-center">
                {tier.benefits.map((b) => (
                  <li key={b} className="flex items-center justify-center gap-2 text-sm text-center" style={{ color: t.textSub }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={visualAccent} strokeWidth="2.5" className="w-3.5 h-3.5 shrink-0"><path d="M5 13l4 4L19 7" /></svg>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <LocalizedBookBtn tier={tier} premium={isPremium} />
            </div></EditableTarget>
            )
          })}
        </div>
      </div>
      {modalTier !== null && tiers[modalTier] && <BookingModal key={`${modalTier}-${previewState}`} tier={tiers[modalTier]} recoveredState={recoveredState} initialStep={previewStep} previewOnly={mode === 'editor' || simulationOnly} onClose={closeBooking} />}
      {mode === 'published' && sessionExpired && modalTier === null && <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/80 p-4"><section className="w-full max-w-md rounded-3xl border border-amber-400/25 bg-[#111113] p-6 text-center text-white"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-400/15 text-xl text-amber-300">!</div><h2 className="mt-4 font-serif text-2xl font-bold">{translate('booking.sessionExpired')}</h2><p className="mt-2 text-sm leading-relaxed text-zinc-400">{translate('booking.sessionExpiredBody')}</p>{expiredState?.bookingReference && <p className="mt-4 rounded-xl bg-white/5 p-3 font-mono text-xs text-emerald-300">{translate('booking.reference')}: {expiredState.bookingReference}</p>}<div className="mt-6 grid gap-2">{expiredState && (expiredState.bookingId || expiredState.reviewRecordId || expiredState.ticketId) && <button onClick={() => { setRecoveredState(expiredState); setSessionExpired(false); setModalTier(Math.min(Math.max(0, expiredState.packageIndex), Math.max(0, tiers.length - 1))) }} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-zinc-950">{translate('booking.recover')}</button>}<button onClick={() => { sessionPersistence.clear(eventId ?? data.hero?.title ?? 'event'); setExpiredState(null); setSessionExpired(false); closeBooking(); window.setTimeout(() => document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} className="rounded-xl bg-white/5 px-4 py-3 text-sm text-zinc-200">{translate('booking.restart')}</button></div></section></div>}
    </section></EditableTarget>
  )
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { name: 'Sophia Chen', role: 'Concert Enthusiast', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format', text: "VIP experience was absolutely flawless. Private lounge, priority entry, complimentary drinks. Apex is the only platform I'll ever use.", accent: '#00FF88' },
  { name: 'Marcus Reid', role: 'Hip-Hop Fan', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format', text: "Booked Drake VVIP and got a personal meet & greet plus signed merch. The booking experience was seamless. Worth every penny.", accent: '#8B5CF6' },
  { name: 'Amelia Torres', role: 'Event Lover', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&auto=format', text: "MSG floor seats through Apex — the seat map was the most intuitive I've ever used. Got exactly where I wanted within 2 minutes.", accent: '#F59E0B' },
  { name: 'James Park', role: 'Music Producer', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&auto=format', text: "Corporate block booking for 40 seats, handled perfectly. The platform is enterprise-grade. Invoicing and management tools are excellent.", accent: '#22D3EE' },
  { name: 'Naomi Wells', role: 'Superfan', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&auto=format', text: "Saw Drake from the Platinum Suite. The view, the production, the exclusivity — nothing else compares. Already booked the next show.", accent: '#F472B6' },
]

function Testimonials() {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data, mode } = useBooking()
  const doubled = [...data.testimonials, ...data.testimonials]
  if (!data.visibility.testimonials && mode !== 'editor') return null
  return (
    <EditableTarget target={{ section: 'testimonials' }}><section id="testimonials" className={`booking-section premium-testimonials py-24 overflow-hidden ${!data.visibility.testimonials ? 'opacity-40' : ''}`}>
      <div className="max-w-7xl mx-auto px-6 mb-12 text-center reveal">
        <div className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: t.textMuted }}>{translate('reviews.eyebrow')}</div>
        <h2 className="font-serif text-4xl md:text-5xl font-bold" style={{ color: t.text }}>{translate('reviews.heading')}</h2>
      </div>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: `linear-gradient(to right,${t.bg},transparent)` }} />
        <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: `linear-gradient(to left,${t.bg},transparent)` }} />
        <div className="overflow-hidden">
          <div className="testimonial-track flex gap-5 py-4" style={{ animation: 'scroll-right 40s linear infinite', width: 'max-content' }}>
            {doubled.map((t2, i) => (
              <EditableTarget key={`${t2.id}-${i}`} target={{ section: 'testimonials', index: i % data.testimonials.length }}><div className="testimonial-card shrink-0 w-80 rounded-2xl p-5" style={{ background: t.card, border: `1px solid ${t.isDark ? t2.accent + '22' : t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
                <div className="flex gap-1 mb-3">{Array(t2.rating).fill(0).map((_, j) => <span key={j} className="text-amber-400 text-sm">★</span>)}</div>
                <p className="text-sm leading-relaxed mb-4" style={{ color: t.textSub }}>"{t2.text}"</p>
                <div className="flex items-center gap-3">
                  <img src={t2.avatar} alt={t2.name} width="36" height="36" className="w-9 h-9 rounded-full object-cover" />
                  <div>
                    <div className="text-sm font-semibold" style={{ color: t.text }}>{t2.name}</div>
                    <div className="text-xs" style={{ color: t.textMuted }}>{t2.role}</div>
                  </div>
                </div>
              </div></EditableTarget>
            ))}
          </div>
        </div>
      </div>
    </section></EditableTarget>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'How do I receive my tickets after booking?', a: 'Tickets are delivered instantly to your email as a QR code. They are also accessible anytime in the Apex app under "My Tickets".' },
  { q: 'Can I transfer or gift my tickets to someone else?', a: 'Yes. Apex supports secure peer-to-peer transfers at face value. Transfers are blockchain-verified to eliminate fraud.' },
  { q: 'What is the refund policy for this event?', a: 'All sales for this event are final once confirmed. In the event of a cancellation by the organiser, a full refund including fees will be issued within 5 business days.' },
  { q: 'Are VIP and VVIP meet & greet times guaranteed?', a: 'VVIP Platinum includes a confirmed meet & greet slot with Drake. Details and timings will be sent 48 hours before the event.' },
  { q: 'What is the bag policy at MSG?', a: 'Madison Square Garden enforces a clear bag policy. Only small clear plastic, vinyl or PVC bags (12"×6"×12") are permitted.' },
  { q: 'Is this event all ages?', a: 'Yes, this event is all ages. However, VIP Lounge access is restricted to guests 21 and older with valid ID.' },
]

function FAQ() {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data, mode } = useBooking()
  const [open, setOpen] = useState<number | null>(0)
  if (!data.visibility.faq && mode !== 'editor') return null
  return (
    <EditableTarget target={{ section: 'faq' }}><section id="faq" className={`booking-section premium-faq py-24 px-6 ${!data.visibility.faq ? 'opacity-40' : ''}`} style={{ background: t.isDark ? t.bg2 : t.sectionAlt }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14 reveal">
          <div className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: t.textMuted }}>{translate('faq.eyebrow')}</div>
          <h2 className="font-serif text-4xl font-bold mb-4" style={{ color: t.text }}>{translate('faq.heading')}</h2>
        </div>
        <div className="space-y-3 reveal">
          {data.faq.map((faq, i) => (
            <EditableTarget key={faq.id} target={{ section: 'faq', index: i }}><div className="faq-card rounded-2xl overflow-hidden transition-all duration-300"
              style={{ background: open === i ? (t.isDark ? 'rgba(0,255,136,0.04)' : `${t.accent}08`) : t.card, border: `1px solid ${open === i ? (t.isDark ? 'rgba(0,255,136,0.25)' : `${t.accent}38`) : t.cardBorder}`, boxShadow: t.isDark ? 'none' : '0 2px 6px rgba(23,26,31,0.03)' }}>
              <button aria-label={translate(open === i ? 'faq.collapse' : 'faq.expand')} className="w-full text-left px-6 py-5 flex items-center justify-between gap-4" onClick={() => setOpen(open === i ? null : i)}>
                <span className="font-semibold text-sm" style={{ color: t.text }}>{faq.q}</span>
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300" style={{ background: open === i ? (t.isDark ? 'rgba(0,255,136,0.15)' : `${t.accent}12`) : t.inputBg, transform: open === i ? 'rotate(45deg)' : 'none' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={open === i ? t.accent : t.textMuted} strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
                </div>
              </button>
              <div className="overflow-hidden transition-all duration-400" style={{ maxHeight: open === i ? 200 : 0, opacity: open === i ? 1 : 0 }}>
                <div className="px-6 pb-5 text-sm leading-relaxed" style={{ color: t.textSub }}>{faq.a}</div>
              </div>
            </div></EditableTarget>
          ))}
        </div>
      </div>
    </section></EditableTarget>
  )
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function CTASection() {
  const { t } = useTheme()
  const { data, mode } = useBooking()
  const cta = data.cta
  if (!data.visibility.cta && mode !== 'editor') return null
  return (
    <EditableTarget target={{ section: 'cta' }}><section id="cta" className={`booking-section premium-cta py-24 px-6 ${!data.visibility.cta ? 'opacity-40' : ''}`}>
      <div className="max-w-5xl mx-auto reveal">
        <div className="premium-cta-card relative rounded-3xl overflow-hidden p-12 md:p-20 text-center" style={{ border: t.isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.12)' }}>
          <img src={cta.image} alt="Concert" width="1200" height="800" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: t.isDark ? 'linear-gradient(135deg,rgba(9,9,11,0.96),rgba(9,9,11,0.88))' : 'linear-gradient(135deg,rgba(15,23,42,0.94),rgba(15,23,42,0.84))' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none" style={{ background: t.isDark ? 'radial-gradient(circle,rgba(0,255,136,0.08) 0%,transparent 70%)' : 'radial-gradient(circle,rgba(37,99,235,0.12) 0%,transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-xs font-mono tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>{cta.eyebrow}</div>
            <h2 className="font-serif text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              {cta.heading}<br /><span className="text-gradient-blue">{cta.accentHeading}</span>
            </h2>
            <p className="text-lg max-w-lg mx-auto mb-10" style={{ color: 'rgba(255,255,255,0.65)' }}>{cta.detail}</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button onClick={() => scrollTo('tickets')} className="btn-magnetic px-10 py-5 rounded-2xl font-bold text-base transition-all hover:-translate-y-1" style={{ background: t.isDark ? `${t.accent}18` : `linear-gradient(135deg,${t.accent},${t.accentDim})`, color: t.isDark ? t.accent : '#FFFFFF', border: t.isDark ? `1px solid ${t.accent}40` : 'none', boxShadow: t.isDark ? `0 8px 24px ${t.accentGlow}` : `0 4px 22px ${t.accentGlow}`, borderRadius: 16 }}>
                {cta.primaryLabel}
              </button>
              <button type="button" onClick={() => window.dispatchEvent(new Event('apex-open-support'))} className="btn-magnetic px-10 py-5 rounded-2xl text-white font-semibold text-base" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 16 }}>
                {cta.secondaryLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section></EditableTarget>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { data, mode } = useBooking()
  const { show, msg } = useToast()
  const [email, setEmail] = useState('')
  if (!data.visibility.footer && mode !== 'editor') return null

  return (
    <EditableTarget target={{ section: 'footer' }}><footer id="footer" className={`border-t pt-16 pb-8 px-6 ${!data.visibility.footer ? 'opacity-40' : ''}`} style={{ borderColor: t.border, background: t.isDark ? t.bg2 : t.bg2 }}>
      <Toast msg={msg} />
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => scrollTo('hero')}>
              <div className="w-10 h-10 rounded-xl p-0.5 shadow-[0_10px_26px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ background: t.isDark ? 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))' : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(226,232,240,0.9))', border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'}` }}>
                <img src={movieTicketLogo} alt="App logo" className="w-full h-full object-contain rounded-[10px]" />
              </div>
              <span className="font-serif font-bold text-xl" style={{ color: t.text, textShadow: t.isDark ? '0 1px 2px rgba(0,0,0,0.45)' : '0 1px 2px rgba(255,255,255,0.7)' }}>Apex Bookings</span>
            </div>
            <p className="text-sm leading-relaxed max-w-56 mb-5" style={{ color: t.textMuted }}>{data.footer.description}</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'instagram', src: instagramIcon, alt: 'Instagram' },
                { key: 'youtube', src: youtubeIcon, alt: 'YouTube' },
                { key: 'twitter', src: twitterIcon, alt: 'Twitter' },
                { key: 'linkedin', src: linkedinIcon, alt: 'LinkedIn' },
              ].map((social) => (
                <button key={social.key} aria-label={social.alt} onClick={() => show(translate('footer.opening', { label: social.alt }))} className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors overflow-hidden p-1.5"
                  style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.isDark ? 'none' : '0 2px 5px rgba(23,26,31,0.03)' }}>
                  <img src={social.src} alt={social.alt} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
          {[
            { heading: translate('footer.event'), links: [translate('footer.about'), translate('footer.schedule'), translate('footer.venue'), translate('footer.packages')] },
            { heading: translate('footer.support'), links: [translate('footer.help'), translate('footer.contact'), translate('footer.refunds'), translate('footer.liveChat')] },
            { heading: translate('footer.legal'), links: [translate('footer.privacy'), translate('footer.terms'), translate('footer.cookies'), translate('footer.accessibility')] },
          ].map((col) => (
            <div key={col.heading}>
              <div className="font-semibold text-sm mb-4" style={{ color: t.text }}>{col.heading}</div>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}><button onClick={() => show(translate('footer.opening', { label: link }))} className="text-sm transition-colors text-left" style={{ color: t.textMuted }}
                    onMouseEnter={(e) => e.currentTarget.style.color = t.textSub}
                    onMouseLeave={(e) => e.currentTarget.style.color = t.textMuted}>{link}</button></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-6 mb-10" style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.isDark ? 'none' : t.cardShadow }}>
          <LocalizedNewsletterRow email={email} setEmail={setEmail} show={show} />
        </div>
        <LocalizedFooterBottom show={show} />
        <div className="mt-8 pt-6 border-t" style={{ borderColor: t.border }}>
          <LanguageSwitcher isDark={t.isDark} textColor={t.textSub} mutedColor={t.textMuted} borderColor={t.border} cardBg={t.isDark ? '#111113' : '#FFFFFF'} accentColor={t.accent} />
        </div>
      </div>
    </footer></EditableTarget>
  )
}


// --- Floating Chat Button ---
// Delegates to PublicSupportChat - preview mode loads demo data only,
// published mode connects to the real supportStore.
function FloatingChatButton({ eventId = 'default', isPreview = false, mode = 'preview' }: { eventId?: string; isPreview?: boolean; mode?: BookingMode }) {
  if (mode === 'editor') return null
  return <PublicSupportChat eventId={eventId} isPreview={isPreview} />
}

function PackageTypeLibraryPicker({ currentName, action, onSelect }: { currentName?: string; action: 'add' | 'replace'; onSelect: (type: PackageTypeDefinition) => void }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.025] p-3">
    <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-white">Package type library</div><div className="mt-1 text-[10px] leading-relaxed text-zinc-500">{action === 'add' ? 'Select a ready-made package to add it to this page.' : 'Apply a package type, then customize every field below.'}</div></div><span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{PACKAGE_TYPE_LIBRARY.length} types</span></div>
    <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
      {PACKAGE_TYPE_LIBRARY.map(type => {
        const selected = currentName === type.name
        return <button key={type.key} type="button" onClick={() => onSelect(type)} className="group rounded-xl border p-2.5 text-left transition-all hover:-translate-y-0.5" style={{ background: selected ? `${type.accent}16` : 'rgba(255,255,255,.035)', borderColor: selected ? `${type.accent}70` : 'rgba(255,255,255,.08)' }}>
          <div className="flex items-start gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base" style={{ background: `${type.accent}18`, border: `1px solid ${type.accent}35` }}>{type.icon}</span><div className="min-w-0"><div className="truncate text-[11px] font-bold text-white">{type.name}</div><div className="mt-0.5 text-[9px] uppercase tracking-wider" style={{ color: type.accent }}>{type.category}</div></div></div>
          <div className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{type.description}</div>
          {type.badge && <span className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `${type.accent}14`, color: type.accent }}>{type.badge}</span>}
        </button>
      })}
    </div>
  </div>
}


function BookingEditorPanel({ data, target, eventId, onApply, onDraftChange, close }: { data: BookingPageData; target: EditorTarget | null; eventId?: string; onApply: (data: BookingPageData) => void; onDraftChange?: (data: BookingPageData) => void; close: () => void }) {
  const [draft, setDraft] = useState<BookingPageData>(() => structuredClone(data))
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [packageNotice, setPackageNotice] = useState<string | null>(null)
  const draftReady = useRef(false)
  useEffect(() => { setDraft(structuredClone(data)); setLibraryOpen(false); setUploadProgress(0); setUploadError(null); setPackageNotice(null) }, [data, target])
  useEffect(() => {
    if (!draftReady.current) { draftReady.current = true; return }
    const timer = window.setTimeout(() => onDraftChange?.(structuredClone(draft)), 120)
    return () => window.clearTimeout(timer)
  }, [draft, onDraftChange])
  if (!target) return null
  const mutate = (change: (next: BookingPageData) => void) => setDraft(current => { const next = structuredClone(current); change(next); return next })
  const input = (label: string, value: string, set: (value: string) => void, multiline = false) => <label className="block"><span className="text-[11px] text-zinc-400">{label}</span>{multiline ? <textarea value={value} onChange={event => set(event.target.value)} className="mt-1.5 h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /> : <input value={value} onChange={event => set(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />}</label>
  const applyImage = (url: string) => mutate(next => { if (target.section === 'hero') next.hero.images[0] = url; if (target.section === 'about') next.about.image = url; if (target.section === 'venue') next.venue.image = url; if (target.section === 'cta') next.cta.image = url; if (target.section === 'testimonials' && target.index !== undefined) next.testimonials[target.index].avatar = url })
  const applyAboutMedia = (url: string, mediaType: 'image' | 'video') => mutate(next => { next.about.image = url; next.about.mediaType = mediaType })
  const upload = async (file?: File) => {
    if (!file) return
    setUploadError(null)
    setUploadProgress(20)
    try {
      const asset = await mediaLibraryStore.upload(file, target.section === 'testimonials' ? 'Artist Photos' : 'Event Banners')
      mediaLibraryStore.use(asset.id, eventId)
      setUploadProgress(90)
      if (target.section === 'about') applyAboutMedia(asset.url, asset.mimeType.startsWith('video/') ? 'video' : 'image')
      else applyImage(asset.url)
      setUploadProgress(100)
    } catch (error) {
      setUploadProgress(0)
      setUploadError(error instanceof Error ? error.message : 'Media upload failed.')
    }
  }
  const duplicate = () => mutate(next => {
    if (target.section === 'timeline' && target.index !== undefined) next.timeline.splice(target.index + 1, 0, { ...next.timeline[target.index], id: crypto.randomUUID(), title: `${next.timeline[target.index].title} (Copy)` })
    if (target.section === 'tickets' && target.index !== undefined) next.packages.splice(target.index + 1, 0, { ...next.packages[target.index], id: crypto.randomUUID(), name: `${next.packages[target.index].name} (Copy)` })
    if (target.section === 'testimonials' && target.index !== undefined) next.testimonials.splice(target.index + 1, 0, { ...next.testimonials[target.index], id: crypto.randomUUID(), name: `${next.testimonials[target.index].name} (Copy)` })
    if (target.section === 'faq' && target.index !== undefined) next.faq.splice(target.index + 1, 0, { ...next.faq[target.index], id: crypto.randomUUID(), q: `${next.faq[target.index].q} (Copy)` })
  })
  const remove = () => mutate(next => { if (target.section === 'timeline' && target.index !== undefined) next.timeline.splice(target.index, 1); if (target.section === 'tickets' && target.index !== undefined && next.packages.length > 1) next.packages.splice(target.index, 1); if (target.section === 'testimonials' && target.index !== undefined) next.testimonials.splice(target.index, 1); if (target.section === 'faq' && target.index !== undefined) next.faq.splice(target.index, 1) })
  const restore = () => mutate(next => {
    const original = DEFAULT_BOOKING_TEMPLATE
    if (target.section === 'hero') next.hero = structuredClone(original.hero)
    if (target.section === 'about') next.about = structuredClone(original.about)
    if (target.section === 'venue') next.venue = structuredClone(original.venue)
    if (target.section === 'timeline') next.timeline = structuredClone(original.timeline)
    if (target.section === 'tickets') next.packages = structuredClone(original.packages)
    if (target.section === 'testimonials') next.testimonials = structuredClone(original.testimonials)
    if (target.section === 'faq') next.faq = structuredClone(original.faq)
    if (target.section === 'cta') next.cta = structuredClone(original.cta)
    if (target.section === 'footer') next.footer = structuredClone(original.footer)
  })
  const imageControls = <><label className="mt-4 block rounded-xl border border-dashed border-white/20 p-3 text-center text-xs text-zinc-300">Upload from device<input hidden type="file" accept="image/*" onChange={event => void upload(event.target.files?.[0])} /></label><button type="button" onClick={() => setLibraryOpen(value => !value)} className="mt-2 w-full rounded-xl bg-white/5 px-3 py-2 text-xs text-emerald-300">Choose from media library</button>{libraryOpen && <div className="mt-2 grid max-h-40 grid-cols-3 gap-2 overflow-y-auto">{mediaLibraryStore.listEventAssets().filter(asset => asset.mimeType.startsWith('image/')).map(asset => <button key={asset.id} type="button" onClick={() => applyImage(asset.url)} className="overflow-hidden rounded-lg border border-white/10"><img src={asset.url} className="aspect-square w-full object-cover" /></button>)}</div>}<button type="button" onClick={() => applyImage('')} className="mt-2 text-xs text-red-300">Delete image</button></>
  const aboutMediaControls = target.section === 'about' ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.03] p-4">
    <div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Event card media</div><div className="mt-1 text-[10px] text-zinc-500">Images display in full. Videos play inline on the event page.</div></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{draft.about.mediaType === 'video' ? 'Video' : 'Image'}</span></div>
    {draft.about.image ? <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/40">{draft.about.mediaType === 'video' ? <video src={draft.about.image} controls playsInline preload="metadata" className="aspect-video w-full object-contain" /> : <img src={draft.about.image} alt="Current event card media" className="aspect-video w-full object-contain" />}</div> : <div className="mt-3 grid aspect-video place-items-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">No media selected</div>}
    <label className="mt-3 block cursor-pointer rounded-xl bg-emerald-400 px-3 py-2.5 text-center text-xs font-bold text-zinc-950">Upload image or video<input hidden type="file" accept="image/*,video/*" onChange={event => void upload(event.target.files?.[0])} /></label>
    <button type="button" onClick={() => setLibraryOpen(value => !value)} className="mt-2 w-full rounded-xl bg-white/5 px-3 py-2.5 text-xs text-emerald-300">Choose from media library</button>
    {libraryOpen && <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">{mediaLibraryStore.listEventAssets().filter(asset => asset.mimeType.startsWith('image/') || asset.mimeType.startsWith('video/')).map(asset => {
      const isVideo = asset.mimeType.startsWith('video/')
      return <button key={asset.id} type="button" onClick={() => applyAboutMedia(asset.url, isVideo ? 'video' : 'image')} aria-label={`Use ${isVideo ? 'video' : 'image'} ${asset.name}`} className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30">{isVideo ? <video src={asset.url} muted playsInline preload="metadata" className="aspect-video w-full object-contain" /> : <img src={asset.url} alt="" className="aspect-video w-full object-contain" />}<span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">{isVideo ? 'Video' : 'Image'}</span></button>
    })}</div>}
    <button type="button" onClick={() => applyAboutMedia('', 'image')} className="mt-2 text-xs text-red-300">Remove media</button>
    {uploadProgress > 0 && uploadProgress < 100 && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><div className="mt-1 text-[10px] text-zinc-500">Uploading {uploadProgress}%</div></div>}
    {uploadProgress === 100 && <div className="mt-2 text-xs text-emerald-300">Media uploaded successfully.</div>}
    {uploadError && <div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{uploadError}</div>}
  </div> : null
  const reviewImageControls = target.section === 'testimonials' && target.index !== undefined ? <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4"><div className="text-[11px] uppercase tracking-wider text-zinc-400">Current customer image</div>{draft.testimonials[target.index].avatar ? <img src={draft.testimonials[target.index].avatar} alt={draft.testimonials[target.index].name} className="mt-3 aspect-square w-28 rounded-2xl object-cover"/> : <div className="mt-3 grid aspect-square w-28 place-items-center rounded-2xl bg-white/5 text-xs text-zinc-500">No image</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => applyImage(data.testimonials[target.index!]?.avatar ?? '')} className="rounded-lg bg-white/5 px-3 py-2 text-xs">Keep Current Image</button><label className="cursor-pointer rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-zinc-950">Replace Image<input hidden type="file" accept="image/*" onChange={event => void upload(event.target.files?.[0])}/></label><button type="button" onClick={() => applyImage('')} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">Remove Image</button></div>{uploadProgress > 0 && uploadProgress < 100 && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${uploadProgress}%` }}/></div><div className="mt-1 text-[10px] text-zinc-500">Uploading {uploadProgress}%</div></div>}{uploadProgress === 100 && <div className="mt-2 text-xs text-emerald-300">Image uploaded successfully.</div>}{uploadError && <div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{uploadError}</div>}</div> : null
  const sectionLabel = BOOKING_SECTION_LABELS
  const headingInput = (key: string, defaultVal: string) => input('Section Heading', draft.sectionHeadings?.[key] ?? defaultVal, value => mutate(next => { if (!next.sectionHeadings) next.sectionHeadings = {}; next.sectionHeadings[key] = value }))
  const fields = () => {
    if (target.section === 'hero') return <>{input('Eyebrow', draft.hero.eyebrow, value => mutate(next => { next.hero.eyebrow = value }))}{input('Hero title', draft.hero.title, value => mutate(next => { next.hero.title = value }))}{input('Host / subtitle', draft.hero.tour, value => mutate(next => { next.hero.tour = value }))}{input('Date', draft.hero.date, value => mutate(next => { next.hero.date = value }))}{input('Venue', draft.hero.venue, value => mutate(next => { next.hero.venue = value }))}{input('Primary button text', draft.hero.primaryCta, value => mutate(next => { next.hero.primaryCta = value }))}{input('Secondary button text', draft.hero.secondaryCta, value => mutate(next => { next.hero.secondaryCta = value }))}{input('Guest performers (one per line)', draft.hero.guests.join('\n'), value => mutate(next => { next.hero.guests = value.split('\n').map(item => item.trim()).filter(Boolean) }), true)}{imageControls}</>
    if (target.section === 'about') return <>{headingInput('about', 'About the Show')}{input('Heading', draft.about.heading, value => mutate(next => { next.about.heading = value }))}{input('Accent heading', draft.about.accentHeading, value => mutate(next => { next.about.accentHeading = value }))}{input('Description', draft.about.body, value => mutate(next => { next.about.body = value }), true)}{input('Supporting copy', draft.about.detail, value => mutate(next => { next.about.detail = value }), true)}{aboutMediaControls}</>
    if (target.section === 'venue') return <>{headingInput('venue', 'Venue')}{input('Venue name', draft.venue.name, value => mutate(next => { next.venue.name = value }))}{input('Address', draft.venue.address, value => mutate(next => { next.venue.address = value }), true)}{input('Google Maps link', draft.venue.mapLink, value => mutate(next => { next.venue.mapLink = value }))}{headingInput('venueFacts', 'Venue Facts')}
      {draft.venueFacts?.map((fact, i) => (
        <div key={fact.id} className="mt-4 border-t border-white/10 pt-4">
          <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={fact.visible} onChange={e => mutate(next => { next.venueFacts[i].visible = e.target.checked })} /><span className="text-sm font-semibold">Fact {i + 1} Visible</span></label>
          {input('Label', fact.label, value => mutate(next => { next.venueFacts[i].label = value }))}
          {input('Value', fact.value, value => mutate(next => { next.venueFacts[i].value = value }))}
        </div>
      ))}
      <div className="mt-4 font-semibold border-t border-white/10 pt-4 text-emerald-400 text-sm">Important Info Cards</div>
      {draft.importantInfo?.map((info, i) => (
        <div key={info.id} className="mt-2 border-white/10 pt-2">
          <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={info.visible} onChange={e => mutate(next => { next.importantInfo[i].visible = e.target.checked })} /><span className="text-sm font-semibold">Visible</span></label>
          {input('Title', info.title, value => mutate(next => { next.importantInfo[i].title = value }))}
          {input('Icon', info.icon, value => mutate(next => { next.importantInfo[i].icon = value }))}
          {input('Body (Markdown/newlines allowed)', info.body, value => mutate(next => { next.importantInfo[i].body = value }), true)}
        </div>
      ))}
      {imageControls}</>

    if (target.section === 'timeline') { 
      if (target.index !== undefined) {
        const item = draft.timeline[target.index]; 
        return <>{input('Time', item.time, value => mutate(next => { next.timeline[target.index!].time = value }))}{input('Title', item.title, value => mutate(next => { next.timeline[target.index!].title = value }))}{input('Description', item.desc, value => mutate(next => { next.timeline[target.index!].desc = value }), true)}{input('Icon (Emoji)', item.icon, value => mutate(next => { next.timeline[target.index!].icon = value }))}{input('Accent Color', item.accent, value => mutate(next => { next.timeline[target.index!].accent = value }))}</>
      }
      return <>{headingInput('timeline', 'The Evening')}</>
    }
    if (target.section === 'tickets') { 
      if (target.index !== undefined) {
        const item = draft.packages[target.index]
        const applyPackageType = (type: PackageTypeDefinition) => {
          mutate(next => {
            const currentId = next.packages[target.index!].id
            next.packages[target.index!] = { ...createPackageFromType(type), id: currentId }
          })
          setPackageNotice(`${type.name} defaults applied. You can customize every field below.`)
        }
        return <>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] p-4">
            <div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${item.accent}18`, border: `1px solid ${item.accent}40` }}>{item.icon}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="font-serif text-lg font-bold text-white">{item.name}</div>{item.badge && <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${item.accent}18`, color: item.accent }}>{item.badge}</span>}</div><div className="mt-1 text-xs text-zinc-400">{item.desc}</div><div className="mt-2 text-xs font-bold" style={{ color: item.accent }}>{item.seats.toLocaleString()} available · {item.benefits.length} benefits</div></div></div>
          </div>
          <PackageTypeLibraryPicker currentName={item.name} action="replace" onSelect={applyPackageType} />
          {packageNotice && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">✓ {packageNotice}</div>}
          {input('Package name', item.name, value => mutate(next => { next.packages[target.index!].name = value }))}
          {input('Description', item.desc, value => mutate(next => { next.packages[target.index!].desc = value }), true)}
          <div className="grid grid-cols-2 gap-3">{input('Price', String(item.price), value => mutate(next => { next.packages[target.index!].price = Math.max(0, Number(value) || 0) }))}{input('Available seats', String(item.seats), value => mutate(next => { next.packages[target.index!].seats = Math.max(0, Number(value) || 0) }))}</div>
          <div><div className="mb-2 text-[11px] text-zinc-400">Quick badge</div><div className="flex flex-wrap gap-1.5">{['Great Value', 'Popular', 'Best Seller', 'Limited', 'Recommended', 'Exclusive', 'Ultimate Access'].map(badge => <button key={badge} type="button" onClick={() => mutate(next => { next.packages[target.index!].badge = badge })} className="rounded-full border px-2.5 py-1 text-[10px]" style={{ background: item.badge === badge ? `${item.accent}18` : 'rgba(255,255,255,.03)', borderColor: item.badge === badge ? `${item.accent}60` : 'rgba(255,255,255,.1)', color: item.badge === badge ? item.accent : '#A1A1AA' }}>{badge}</button>)}<button type="button" onClick={() => mutate(next => { next.packages[target.index!].badge = null })} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-500">No badge</button></div></div>
          {input('Custom badge', item.badge ?? '', value => mutate(next => { next.packages[target.index!].badge = value.trim() || null }))}
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">{input('Icon', item.icon, value => mutate(next => { next.packages[target.index!].icon = value }))}<label className="block"><span className="text-[11px] text-zinc-400">Accent</span><input type="color" value={item.accent} onChange={event => mutate(next => { next.packages[target.index!].accent = event.target.value; next.packages[target.index!].glow = `${event.target.value}38` })} className="mt-1.5 h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-1" /></label></div>
          {input('Seat sections (one per line)', item.sections.join('\n'), value => mutate(next => { next.packages[target.index!].sections = value.split('\n').map(section => section.trim()).filter(Boolean) }), true)}
          {input('Benefits (one per line)', item.benefits.join('\n'), value => mutate(next => { next.packages[target.index!].benefits = value.split('\n').map(benefit => benefit.trim()).filter(Boolean) }), true)}
        </>
      }
      return <>{headingInput('tickets', 'Select Packages')}
        <PackageTypeLibraryPicker action="add" onSelect={type => { mutate(next => { next.packages.push(createPackageFromType(type)) }); setPackageNotice(`${type.name} was added. Apply these changes, then tap its card to customize it.`) }} />
        {packageNotice && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">✓ {packageNotice}</div>}
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Current packages</div><div className="mt-2 flex flex-wrap gap-2">{draft.packages.map(item => <span key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-300"><span>{item.icon}</span>{item.name}</span>)}</div></div>
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-xs font-semibold mb-1 text-emerald-400">Quick show bundles</div>
          <div className="mb-3 text-[10px] text-zinc-500">Replace all packages with a ready-made two-tier show setup.</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries({
              'Concert': [
                { id: 'regular', name: 'Regular', price: 150, desc: 'Standard floor access', badge: 'Great Value', accent: '#64748B', glow: 'rgba(100,116,139,0.2)', seats: 5000, icon: '🎫', sections: ['Floor'], benefits: ['Standard entry', 'Floor access', 'Mobile ticket delivery'] },
                { id: 'vip', name: 'VIP Pit', price: 350, desc: 'Premium pit access', badge: 'Best Seller', accent: '#00D982', glow: 'rgba(0,217,130,0.24)', seats: 500, icon: '💎', sections: ['VIP Pit'], benefits: ['Early entry', 'Pit access', 'VIP bar'] }
              ],
              'Comedy': [
                { id: 'ga', name: 'Standard Seating', price: 65, desc: 'Rear stalls', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 800, icon: '🪑', sections: ['Stalls'], benefits: ['Standard entry', 'Reserved seat'] },
                { id: 'front', name: 'Front Row', price: 120, desc: 'Best views', badge: null, accent: '#8B5CF6', glow: 'rgba(139,92,246,0.22)', seats: 50, icon: '🎭', sections: ['Row A'], benefits: ['Front row seat', 'Meet & greet'] }
              ],
              'Sports': [
                { id: 'ga', name: 'Upper Tier', price: 90, desc: 'Upper bowl', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 15000, icon: '🎫', sections: ['Upper Bowl'], benefits: ['Standard entry'] },
                { id: 'club', name: 'Club Level', price: 280, desc: 'Premium seating', badge: 'Popular', accent: '#F59E0B', glow: 'rgba(245,158,11,0.22)', seats: 2000, icon: '🏆', sections: ['Club'], benefits: ['Club access', 'Padded seats', 'Private bar'] }
              ],
              'Theatre': [
                { id: 'balcony', name: 'Balcony', price: 75, desc: 'Upper level', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 800, icon: '🎭', sections: ['Balcony'], benefits: ['Standard entry'] },
                { id: 'stalls', name: 'Premium Stalls', price: 145, desc: 'Main floor', badge: 'Best View', accent: '#22D3EE', glow: 'rgba(34,211,238,0.22)', seats: 400, icon: '✨', sections: ['Stalls'], benefits: ['Premium seat', 'Lounge access'] }
              ]
            }).map(([presetName, presetData]) => (
              <button key={presetName} onClick={() => mutate(next => { next.packages = presetData })} className="bg-white/5 border border-white/10 rounded-xl p-2 text-xs hover:bg-white/10 transition-colors">
                {presetName}
              </button>
            ))}
          </div>
        </div>
      </>
    }
    if (target.section === 'testimonials') { 
      if (target.index !== undefined) {
        const item = draft.testimonials[target.index]; return <>{reviewImageControls}{input('Customer name', item.name, value => mutate(next => { next.testimonials[target.index!].name = value }))}{input('Role', item.role, value => mutate(next => { next.testimonials[target.index!].role = value }))}{input('Review', item.text, value => mutate(next => { next.testimonials[target.index!].text = value }), true)}{input('Rating (1–5)', String(item.rating), value => mutate(next => { next.testimonials[target.index!].rating = Math.max(1, Math.min(5, Number(value) || 5)) }))}</>
      }
      return <>{headingInput('testimonials', 'From Our Attendees')}</>
    }
    if (target.section === 'faq') { 
      if (target.index !== undefined) {
        const item = draft.faq[target.index]; return <>{input('Question', item.q, value => mutate(next => { next.faq[target.index!].q = value }), true)}{input('Answer', item.a, value => mutate(next => { next.faq[target.index!].a = value }), true)}</> 
      }
      return <>{headingInput('faq', 'Questions')}</>
    }
    if (target.section === 'cta') return <>{headingInput('cta', 'Limited Availability')}{input('Eyebrow', draft.cta.eyebrow, value => mutate(next => { next.cta.eyebrow = value }))}{input('Heading', draft.cta.heading, value => mutate(next => { next.cta.heading = value }))}{input('Accent heading', draft.cta.accentHeading, value => mutate(next => { next.cta.accentHeading = value }))}{input('Description', draft.cta.detail, value => mutate(next => { next.cta.detail = value }), true)}{input('Primary button', draft.cta.primaryLabel, value => mutate(next => { next.cta.primaryLabel = value }))}{input('Secondary button', draft.cta.secondaryLabel, value => mutate(next => { next.cta.secondaryLabel = value }))}{imageControls}</>
    return <>{input('Brand', draft.footer.brand, value => mutate(next => { next.footer.brand = value }))}{input('Description', draft.footer.description, value => mutate(next => { next.footer.description = value }), true)}{input('Copyright', draft.footer.copyright, value => mutate(next => { next.footer.copyright = value }))}</>
  }
  const canDuplicate = ['timeline', 'tickets', 'testimonials', 'faq'].includes(target.section) && target.index !== undefined
  const canDelete = ['timeline', 'tickets', 'testimonials', 'faq'].includes(target.section) && target.index !== undefined
  return <aside className="package-editor-panel fixed inset-y-0 right-0 z-[300] flex w-full max-w-lg flex-col border-l border-white/10 bg-[#111113] text-white shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 p-5"><div><p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Booking page editor</p><h2 className="font-serif text-xl font-bold">Edit {sectionLabel[target.section]}</h2></div><button type="button" onClick={close} className="text-zinc-400">✕</button></div><div className="flex-1 space-y-4 overflow-y-auto p-5">{fields()}<div className="border-t border-white/10 pt-4"><label className="flex items-center justify-between text-sm"><span>{draft.visibility[target.section] ? 'Visible section' : 'Hidden section'}</span><input type="checkbox" checked={draft.visibility[target.section]} onChange={event => mutate(next => { next.visibility[target.section] = event.target.checked })} /></label><div className="mt-3 flex flex-wrap gap-3 text-xs"><button type="button" onClick={restore} className="text-emerald-300">Restore default</button>{canDuplicate && <button type="button" onClick={duplicate} className="text-zinc-300">Duplicate</button>}{canDelete && <button type="button" onClick={remove} className="text-red-300">Delete</button>}</div></div></div><div className="flex gap-2 border-t border-white/10 p-4"><button type="button" onClick={close} className="flex-1 rounded-xl bg-white/5 px-3 py-2.5 text-sm">Cancel</button><button type="button" onClick={() => { onApply(draft); close() }} className="flex-1 rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-bold text-zinc-950">Apply</button></div></aside>
}

// ─── Booking Site ─────────────────────────────────────────────────────────────
type PublicationReview = { pageName: string; eventDate: string; venue: string; currency: string; language: string; publicUrl: string }
type EventStudioRecoverySnapshot = { eventId: string; data: BookingPageData; selected: EditorTarget | null; previewState: StudioPreviewState; deviceMode: 'desktop' | 'tablet' | 'mobile'; publicationOpen: boolean; socialProofOpen: boolean; updatedAt: number }

export function BookingSite({ onAdminClick, mode = 'preview', data: sourceData, payments: sourcePayments, eventId, eventCountryCode, eventCurrencyCode, eventLanguageCode, eventTitle, publicationReview, socialProofOverride, simulationOnly = false, onSocialProofChange, onSave, onPublish, onExit }: {
  onAdminClick: () => void
  mode?: BookingMode
  data?: BookingPageData
  payments?: EventPaymentSettings
  eventId?: string
  eventCountryCode?: string
  eventCurrencyCode?: string
  eventLanguageCode?: string
  eventTitle?: string
  publicationReview?: PublicationReview
  socialProofOverride?: EventSocialProofOverride
  simulationOnly?: boolean
  onSocialProofChange?: (settings: EventSocialProofOverride) => void | Promise<void>
  onSave?: (data: BookingPageData) => void | Promise<void>
  onPublish?: (data: BookingPageData) => Promise<string>
  onExit?: () => void
}) {
  const { getUiState, setUiState, registerFlusher, saveStatus, setSaveStatus } = useAdminSessionRecovery()
  const recoveryKey = `eventStudio:${eventId ?? (mode === 'editor' ? 'template' : 'preview')}`
  const recoveredEditor = mode === 'editor' ? getUiState<EventStudioRecoverySnapshot>(recoveryKey) : undefined
  const initialSource = sourceData ?? masterBookingTemplateStore.load()
  const initialData = recoveredEditor?.eventId === (eventId ?? 'template') ? recoveredEditor.data : initialSource
  const [isDark, setIsDark] = useState(true)
  const t = isDark ? DARK : LIGHT
  const toggle = useCallback(() => setIsDark((d) => !d), [])
  const [data, setData] = useState<BookingPageData>(() => structuredClone(initialData))
  const [selected, setSelected] = useState<EditorTarget | null>(() => recoveredEditor?.selected ?? null)
  const [previewState, setPreviewState] = useState<StudioPreviewState>(() => recoveredEditor?.previewState ?? 'page')
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>(() => recoveredEditor?.deviceMode ?? 'desktop')
  const [publicationOpen, setPublicationOpen] = useState(() => recoveredEditor?.publicationOpen ?? false)
  const [publishing, setPublishing] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [publicationError, setPublicationError] = useState<string | null>(null)
  const [publicationNotice, setPublicationNotice] = useState<string | null>(null)
  const [socialProofOpen, setSocialProofOpen] = useState(() => recoveredEditor?.socialProofOpen ?? false)
  const [eventSocialProof, setEventSocialProof] = useState<EventSocialProofOverride>(() => socialProofOverride ?? {})
  const latestDataRef = useRef(data)
  const lastSavedHash = useRef(JSON.stringify(initialSource))
  const saveTimer = useRef<number | null>(null)
  const saveInFlight = useRef<Promise<void> | null>(null)
  useReveal(data)

  useEffect(() => { latestDataRef.current = data }, [data])

  const saveDraftNow = useCallback(async () => {
    if (mode !== 'editor' || !onSave) return
    if (!navigator.onLine) { setSaveStatus('offline'); return }
    const next = latestDataRef.current
    const nextHash = JSON.stringify(next)
    if (nextHash === lastSavedHash.current) { setSaveStatus('saved'); return }
    if (saveInFlight.current) await saveInFlight.current
    setSaveStatus('saving')
    const operation = Promise.resolve(onSave(next)).then(() => {
      lastSavedHash.current = nextHash
      setSaveStatus('saved')
    }).catch(error => {
      setSaveStatus(navigator.onLine ? 'error' : 'offline')
      setPublicationError(error instanceof Error ? error.message : 'The page changes could not be saved.')
    }).finally(() => { saveInFlight.current = null })
    saveInFlight.current = operation
    await operation
  }, [mode, onSave, setSaveStatus])

  useEffect(() => {
    if (mode !== 'editor') return
    const snapshot: EventStudioRecoverySnapshot = { eventId: eventId ?? 'template', data, selected, previewState, deviceMode, publicationOpen, socialProofOpen, updatedAt: Date.now() }
    setUiState(recoveryKey, snapshot)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (JSON.stringify(data) !== lastSavedHash.current) {
      setSaveStatus(navigator.onLine ? 'saving' : 'offline')
      saveTimer.current = window.setTimeout(() => void saveDraftNow(), 1500)
    }
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [data, deviceMode, eventId, mode, previewState, publicationOpen, recoveryKey, saveDraftNow, selected, setSaveStatus, setUiState, socialProofOpen])

  useEffect(() => {
    if (mode !== 'editor') return
    return registerFlusher(recoveryKey, saveDraftNow)
  }, [mode, recoveryKey, registerFlusher, saveDraftNow])

  const touchedSectionSet = new Set(data.editorState?.touchedSections ?? [])
  const editedSections = BOOKING_SECTION_IDS.filter(section => touchedSectionSet.has(section))
  const untouchedSections = BOOKING_SECTION_IDS.filter(section => !touchedSectionSet.has(section))

  const applyEditorChanges = (next: BookingPageData) => {
    if (selected) {
      const touchedSections = new Set(next.editorState?.touchedSections ?? [])
      touchedSections.add(selected.section)
      next.editorState = {
        touchedSections: BOOKING_SECTION_IDS.filter(section => touchedSections.has(section)),
        updatedAtBySection: {
          ...(next.editorState?.updatedAtBySection ?? {}),
          [selected.section]: new Date().toISOString(),
        },
      }
    }
    setData(next)
  }

  const focusEditorSection = (section: BookingSectionId) => {
    setPublicationOpen(false)
    setPreviewState('page')
    setSelected({ section })
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  useEffect(() => {
    document.body.style.background = t.bg
    document.body.style.color = t.text
  }, [t])

  useEffect(() => {
    if (!sourceData) return
    if (JSON.stringify(latestDataRef.current) === lastSavedHash.current) {
      const next = structuredClone(sourceData)
      setData(next)
      lastSavedHash.current = JSON.stringify(next)
    }
  }, [sourceData])
  useEffect(() => setEventSocialProof(socialProofOverride ?? {}), [socialProofOverride])
  useEffect(() => {
    if (!publicationOpen && !socialProofOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [publicationOpen, socialProofOpen])

  const missingPublicationFields = publicationReview
    ? ([['Page name', publicationReview.pageName], ['Event date', publicationReview.eventDate], ['Venue', publicationReview.venue], ['Currency', publicationReview.currency], ['Language', publicationReview.language]] as const).filter(([, value]) => !value?.trim()).map(([label]) => label)
    : []

  const confirmPublish = async () => {
    if (!onPublish || missingPublicationFields.length) return
    setPublishing(true)
    setPublicationError(null)
    try {
      await saveDraftNow()
      setPublishedUrl(await onPublish(data))
      setPublicationNotice(null)
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : 'The page could not be published.')
    } finally {
      setPublishing(false)
    }
  }

  const copyPublishedLink = async () => {
    if (!publishedUrl) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(publishedUrl)
      else {
        const input = document.createElement('textarea')
        input.value = publishedUrl
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        if (!document.execCommand('copy')) throw new Error('Copy was not available')
        input.remove()
      }
      setPublicationNotice('Published link copied.')
    } catch {
      setPublicationNotice('Copy failed. Select the link above to copy it manually.')
    }
  }

  const openPublishedPage = () => {
    if (!publishedUrl) return
    const opened = window.open(publishedUrl, '_blank')
    if (opened) opened.opener = null
    else window.location.assign(publishedUrl)
  }

  const publicationSectionReview = <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-bold">Page section review</div><div className="mt-1 text-xs text-zinc-500">Select any badge to jump directly to that editor section.</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${untouchedSections.length ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{editedSections.length}/{BOOKING_SECTION_IDS.length} edited</span></div>{editedSections.length > 0 && <div className="mt-4"><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Edited sections</div><div className="mt-2 flex flex-wrap gap-2">{editedSections.map(section => <button key={section} type="button" onClick={() => focusEditorSection(section)} className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-200">✓ {BOOKING_SECTION_LABELS[section]}</button>)}</div></div>}{untouchedSections.length > 0 && <div className="mt-4"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Untouched sections — review recommended</div><div className="mt-2 flex flex-wrap gap-2">{untouchedSections.map(section => <button key={section} type="button" onClick={() => focusEditorSection(section)} className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-200">● {BOOKING_SECTION_LABELS[section]}</button>)}</div></div>}</div>

  return (
    <LocaleProvider eventCountryCode={eventCountryCode} eventCurrencyCode={eventCurrencyCode} eventLanguageCode={eventLanguageCode}>
    <ThemeCtx.Provider value={{ t, toggle }}><BookingCtx.Provider value={{ data, mode, select: setSelected, payments: sourcePayments ?? PLATFORM_PAYMENT_DEFAULTS, eventId, previewState, simulationOnly }}>
      <SocialProofOverlayProvider>
      <div className="booking-experience ios-stable-scroll" data-theme={t.isDark ? 'dark' : 'light'} style={{ background: t.bg, color: t.text, transition: 'background 0.4s ease, color 0.4s ease', minHeight: '100dvh' }}>
        {mode === 'editor' && <div className="fixed inset-x-3 top-3 z-[250] flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/30 bg-zinc-950/95 px-3 py-2 shadow-2xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2"><div className="mr-auto sm:mr-3"><div className="text-xs font-bold text-white">{eventTitle ?? 'Booking page editor'}</div><div className="text-[10px] text-zinc-400">Tap any section to edit it in the right panel</div></div><span className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold ${untouchedSections.length ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{editedSections.length}/{BOOKING_SECTION_IDS.length} sections edited</span><span role="status" className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold ${saveStatus === 'error' ? 'bg-red-400/10 text-red-200' : saveStatus === 'offline' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-zinc-300'}`}>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'offline' ? 'Offline — changes pending' : saveStatus === 'error' ? 'Save failed — retry' : saveStatus === 'saved' ? 'Saved' : 'Ready'}</span><select aria-label="Payment-flow preview state" value={previewState} onChange={event => setPreviewState(event.target.value as StudioPreviewState)} className="max-w-48 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white"><option value="page">Normal booking page</option><option value="packages">Package selection</option><option value="checkout">Checkout</option><option value="payment-pending">Payment pending</option><option value="awaiting-bank-details">Awaiting bank details</option><option value="payment-submitted">Payment submitted</option><option value="payment-approved">Payment approved / completed</option><option value="payment-declined">Payment declined</option><option value="ticket-confirmation">Ticket confirmation</option></select>{onSocialProofChange && <button type="button" onClick={() => setSocialProofOpen(true)} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white">Social proof</button>}<button type="button" onClick={() => void saveDraftNow()} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white">Save draft</button>{onPublish && <button type="button" onClick={() => { void saveDraftNow().then(() => { setPublishedUrl(null); setPublicationError(null); setPublicationOpen(true) }) }} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-zinc-950">Publish</button>}<button type="button" onClick={() => { void saveDraftNow().then(() => onExit?.()) }} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white">Exit</button></div>}
        {mode === 'editor' && <select aria-label="Editor device mode" value={deviceMode} onChange={event => setDeviceMode(event.target.value as 'desktop' | 'tablet' | 'mobile')} className="fixed right-3 top-24 z-[249] rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-white shadow-xl"><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select>}
        <div data-editor-device={mode === 'editor' ? deviceMode : undefined} style={mode === 'editor' ? { width: '100%', maxWidth: deviceMode === 'mobile' ? 390 : deviceMode === 'tablet' ? 768 : 'none', marginInline: 'auto' } : undefined}>
          <ScrollProgress />
          <Nav onToggleTheme={toggle} onAdminClick={onAdminClick} />
          <Hero />
          <AboutShow />
          <VenueMap />
          <EventTimeline />
          <TicketSection />
          <Testimonials />
          <FAQ />
          <CTASection />
          <Footer />
          <FloatingChatButton eventId={eventId ?? data?.hero?.title ?? 'default'} isPreview={mode === 'preview'} mode={mode} />
          {mode !== 'editor' && <PublicConversionEnhancements packages={data.packages as any} seats={[]} eventId={eventId} isPreview={mode === 'preview'} settingsOverride={socialProofOverride} />}
          {mode !== 'published' && <PublicOnboardingGuide context={mode === 'editor' ? 'booking-page editor' : 'booking preview'} />}
        </div>
        {mode === 'editor' && <BookingEditorPanel data={data} target={selected} eventId={eventId} onDraftChange={setData} onApply={applyEditorChanges} close={() => setSelected(null)} />}
        {socialProofOpen && <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/80 p-4"><section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111113] p-6 text-white"><p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Event override</p><h2 className="mt-2 font-serif text-2xl font-bold">Social proof for this event</h2><p className="mt-1 text-sm text-zinc-500">Only entered values override the defaults in Admin Settings.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between rounded-xl bg-white/[.04] p-3 text-sm">Enabled<input type="checkbox" checked={eventSocialProof.enabled ?? true} onChange={event => setEventSocialProof(current => ({ ...current, enabled: event.target.checked }))}/></label><label className="flex items-center justify-between rounded-xl bg-white/[.04] p-3 text-sm">Show on mobile<input type="checkbox" checked={eventSocialProof.mobileVisible ?? true} onChange={event => setEventSocialProof(current => ({ ...current, mobileVisible: event.target.checked }))}/></label><label className="sm:col-span-2 text-xs text-zinc-400">Popup message<input value={eventSocialProof.message ?? ''} onChange={event => setEventSocialProof(current => ({ ...current, message: event.target.value }))} placeholder="Use global default" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white"/></label><label className="text-xs text-zinc-400">Duration<input type="number" value={eventSocialProof.duration ?? ''} onChange={event => setEventSocialProof(current => ({ ...current, duration: Number(event.target.value) || undefined }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm"/></label><label className="text-xs text-zinc-400">Delay<input type="number" value={eventSocialProof.delay ?? ''} onChange={event => setEventSocialProof(current => ({ ...current, delay: Number(event.target.value) || undefined }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm"/></label></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setSocialProofOpen(false)} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Cancel</button><button onClick={() => { void onSocialProofChange?.(eventSocialProof); setSocialProofOpen(false) }} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Save event override</button></div></section></div>}
        {publicationOpen && publicationReview && <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/80 p-4"><section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#111113] p-6 text-white">{publishedUrl ? <div className="text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-400 text-xl font-bold text-zinc-950">✓</div><h2 className="mt-4 font-serif text-2xl font-bold">Page published successfully</h2><p className="mt-2 break-all text-sm text-zinc-400">{publishedUrl}</p>{publicationNotice && <p className="mt-3 text-xs text-emerald-300" role="status">{publicationNotice}</p>}<div className="mt-6 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => void copyPublishedLink()} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Copy Link</button><button type="button" onClick={openPublishedPage} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Open Published Page</button><button type="button" onClick={() => setPublicationOpen(false)} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Close</button></div></div> : <><p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Publication review</p><h2 className="mt-2 font-serif text-2xl font-bold">Review before publishing</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Page name', publicationReview.pageName], ['Event date', publicationReview.eventDate], ['Venue', publicationReview.venue], ['Currency', publicationReview.currency], ['Language', publicationReview.language], ['Public URL', publicationReview.publicUrl]].map(([label, value]) => <div key={label} className="rounded-xl bg-white/[.04] p-3"><div className="text-[10px] uppercase text-zinc-500">{label}</div><div className="mt-1 break-all text-sm font-semibold">{value || 'Missing'}</div></div>)}</div>{publicationSectionReview}{missingPublicationFields.length > 0 && <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-200">Missing required information: {missingPublicationFields.join(', ')}</div>}{publicationError && <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{publicationError}</div>}<div className="mt-6 flex flex-wrap justify-end gap-2"><button disabled={publishing} onClick={() => setPublicationOpen(false)} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Cancel</button><button disabled={publishing} onClick={() => { void saveDraftNow().then(() => window.open(eventId ? `/admin/events/${eventId}/preview` : '/demo', '_blank', 'noopener,noreferrer')) }} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Preview Page</button><button disabled={publishing || missingPublicationFields.length > 0} onClick={() => void confirmPublish()} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-40">{publishing ? 'Publishing…' : 'Confirm and Publish'}</button></div></>}</section></div>}
      </div>
      </SocialProofOverlayProvider>
    </BookingCtx.Provider></ThemeCtx.Provider>
    </LocaleProvider>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const PAGE_BY_PATH = { '/admin/events': 'events', '/admin/bookings': 'bookings', '/admin/payments': 'payments', '/admin/media': 'media', '/admin/chat': 'chat', '/admin/notifications': 'notifications', '/admin/settings': 'settings', '/admin/documentation': 'documentation' } as const
type AdminDashboardPage = 'dashboard' | 'events' | 'bookings' | 'payments' | 'media' | 'chat' | 'notifications' | 'settings' | 'documentation'
function adminPageForPath(pathname: string): AdminDashboardPage { return (Object.entries(PAGE_BY_PATH).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? 'dashboard') as AdminDashboardPage }
function AdminRoutePage() { const navigate = useNavigate(); const location = useLocation(); const { signOut } = useAuth(); const page = adminPageForPath(location.pathname); return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-zinc-950 text-sm text-zinc-400">Loading dashboard…</div>}><AdminDashboard initialPage={page} onNavigate={(next) => navigate(ROUTES.admin[next])} onExitAdmin={() => { void signOut(); navigate('/') }} /></Suspense> }
function BookingEditorRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isTemplate = id === 'template'
  const [event, setEvent] = useState<ReturnType<typeof adminEventStore.list>[number] | undefined>(() => isTemplate ? undefined : adminEventStore.list().find(item => item.id === id))

  useEffect(() => adminEventStore.subscribe(() => {
    if (isTemplate) return
    const next = adminEventStore.list().find(item => item.id === id)
    setEvent(next)
    if (!next) navigate(ROUTES.admin.events, { replace: true })
  }), [id, isTemplate, navigate])

  if (!isTemplate && !event) return <Navigate to={ROUTES.admin.events} replace />
  const data = isTemplate ? masterBookingTemplateStore.load() : event?.bookingPage ?? createBookingPageData({ name: event?.title, venue: event?.venue, banners: event?.setup?.banners })
  const save = async (next: BookingPageData) => {
    if (isTemplate) masterBookingTemplateStore.save(next)
    else if (event) setEvent(await adminEventStore.saveAsync({ ...event, bookingPage: next }))
  }
  const publish = async (next: BookingPageData) => {
    if (!event?.publication?.shortCode) throw new Error('This event does not have a reserved public link.')
    const saved = await adminEventStore.saveAsync({
      ...event,
      bookingPage: next,
      status: 'published',
      publication: { ...event.publication, publishedAt: event.publication.publishedAt ?? new Date().toISOString() },
    })
    setEvent(saved)
    return `${window.location.origin}/e/${saved.publication!.shortCode}`
  }
  return <BookingSite
    mode="editor"
    data={data}
    payments={event?.payments}
    eventId={event?.id}
    eventTitle={isTemplate ? 'Default Booking Template' : event?.title}
    eventCountryCode={event?.locale?.countryCode}
    eventCurrencyCode={event?.locale?.currencyCode}
    eventLanguageCode={event?.locale?.languageCode}
    socialProofOverride={event?.socialProofOverride}
    publicationReview={event ? {
      pageName: event.title,
      eventDate: event.date,
      venue: event.venue,
      currency: event.locale?.currencyCode ?? 'USD',
      language: event.locale?.languageCode ?? 'en-US',
      publicUrl: `${window.location.origin}/e/${event.publication?.shortCode ?? ''}`,
    } : undefined}
    onAdminClick={() => navigate(ROUTES.admin.events)}
    onSave={save}
    onSocialProofChange={event ? async settings => { setEvent(await adminEventStore.saveAsync({ ...event, socialProofOverride: settings })) } : undefined}
    onPublish={isTemplate ? undefined : publish}
    onExit={() => navigate(ROUTES.admin.events)}
  />
}
function AdminEventPreviewRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(() => adminEventStore.list().find(item => item.id === id))
  useEffect(() => adminEventStore.subscribe(() => setEvent(adminEventStore.list().find(item => item.id === id))), [id])
  if (!event) return <Navigate to={ROUTES.admin.events} replace />
  const data = event.bookingPage ? normalizeBookingPageData(event.bookingPage) : createBookingPageData({ name: event.title, venue: event.venue, banners: event.setup?.banners })
  return <BookingSite mode="preview" data={data} payments={event.payments} eventId={event.id} eventCountryCode={event.locale?.countryCode} eventCurrencyCode={event.locale?.currencyCode} eventLanguageCode={event.locale?.languageCode} simulationOnly onAdminClick={() => navigate(`/admin/events/${event.id}/edit`)} />
}
function PublicEventRoute({ short = false }: { short?: boolean }) {
  const params = useParams()
  const identifier = short ? params.code : params.slug
  const [event, setEvent] = useState(() => adminEventStore.list().find(candidate => short ? candidate.publication?.shortCode === identifier : candidate.publication?.slug === identifier) ?? null)
  const [loading, setLoading] = useState(Boolean(identifier))
  useEffect(() => {
    if (!identifier) { setLoading(false); return }
    let active = true
    void adminEventStore.loadPublic(identifier).then(next => { if (active && next) setEvent(next) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [identifier])
  useEffect(() => { if (event?.status === 'published') analyticsStore.record(event.id, 'views') }, [event?.id, event?.status])
  if (loading && !event) return <main className="grid min-h-screen place-items-center bg-[#09090B] text-zinc-400">Loading event…</main>
  if (!event || event.status !== 'published') return <Navigate to="/" replace />
  const data = event.bookingPage ? normalizeBookingPageData(event.bookingPage) : createBookingPageData({ name: event.title, venue: event.venue, banners: event.setup?.banners })
  return <BookingSite mode="published" data={data} payments={event.payments} eventId={event.id} eventCountryCode={event.locale?.countryCode} eventCurrencyCode={event.locale?.currencyCode} eventLanguageCode={event.locale?.languageCode} onAdminClick={() => { window.location.assign(ROUTES.adminLogin) }} />
}
function DefaultPreviewRoute() { const [data, setData] = useState(() => masterBookingTemplateStore.load()); useEffect(() => { let active = true; void masterBookingTemplateStore.hydratePublic().then(next => { if (active) setData(next) }).catch(() => undefined); const unsubscribe = masterBookingTemplateStore.subscribe(() => setData(masterBookingTemplateStore.load())); return () => { active = false; unsubscribe() } }, []); return <BookingSite mode="preview" data={data} onAdminClick={() => { window.location.assign(ROUTES.adminLogin) }} /> }
function RootRoute() { const { session, loading } = useAuth(); if (loading) return <main className="grid min-h-screen place-items-center bg-[#09090B] text-zinc-400">Restoring session…</main>; return <Navigate to={session ? (getAdminResumeRoute(session.user.id) ?? ROUTES.admin.dashboard) : ROUTES.adminLogin} replace /> }
export default function App() { return <Routes><Route path="/" element={<RootRoute />} /><Route path="/demo" element={<DefaultPreviewRoute />} /><Route path="/events" element={<Navigate to={ROUTES.adminLogin} replace />} /><Route path="/events/:slug/*" element={<PublicEventRoute />} /><Route path="/e/:code/*" element={<PublicEventRoute short />} /><Route path="/booking" element={<Navigate to={ROUTES.adminLogin} replace />} /><Route path="/payment" element={<Navigate to={ROUTES.adminLogin} replace />} /><Route path="/confirmation" element={<Navigate to={ROUTES.adminLogin} replace />} /><Route path="/support" element={<Navigate to={ROUTES.adminLogin} replace />} /><Route path={ROUTES.adminLogin} element={<AdminLoginPage />} /><Route path={ROUTES.ticket} element={<LocaleProvider><TicketVerificationPage /></LocaleProvider>} /><Route element={<ProtectedRoute />}><Route path="/admin/events/:id/edit" element={<BookingEditorRoute />} /><Route path="/admin/events/:id/preview" element={<AdminEventPreviewRoute />} /><Route path="/admin/*" element={<AdminRoutePage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes> }

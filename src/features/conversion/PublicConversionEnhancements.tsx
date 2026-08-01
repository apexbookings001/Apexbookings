import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StudioSeat, TicketPackage } from '../events/adminEventStore'
import { socialProofStore, type SocialProofItem } from './socialProofStore'
import { useTheme } from '../../theme'
import { MobileSocialProofOverlay } from './MobileSocialProofOverlay'
import { useSocialProofOverlay } from './SocialProofOverlayContext'
import { useLocale } from '../../i18n/LocaleContext'
import type { EventSocialProofOverride } from '../events/adminEventStore'

const positionClass: Record<SocialProofItem['position'], string> = { 'top-left': 'top-20 left-4', 'top-center': 'top-20 left-1/2 -translate-x-1/2', 'top-right': 'top-20 right-4', 'bottom-left': 'bottom-6 left-4', 'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2', 'bottom-right': 'bottom-6 right-4' }

export function PublicConversionEnhancements({ packages, seats, eventId, isPreview = false, settingsOverride }: { packages: TicketPackage[]; seats: StudioSeat[]; eventId?: string; isPreview?: boolean; settingsOverride?: EventSocialProofOverride }) {
  const { t } = useTheme()
  const { formatPrice, translations } = useLocale()
  const [showBar, setShowBar] = useState(false)
  const [toast, setToast] = useState<SocialProofItem | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [socialProofVersion, setSocialProofVersion] = useState(0)
  const [socialProofReady, setSocialProofReady] = useState(isPreview || !eventId)
  const played = useRef(new Set<string>())
  const startingPrice = Math.min(...packages.map(item => item.price || Infinity))
  const available = seats.length > 0 
    ? seats.filter(seat => seat.status === 'available').length 
    : packages.reduce((sum, pkg: any) => sum + (pkg.seats || pkg.capacity || 0), 0)
  const notices = useMemo(() => {
    const settings = socialProofStore.settings()
    const configured = socialProofStore.list().filter(item => item.visible && (item.sourceType !== 'demo' || isPreview) && (item.sourceType !== 'verified_booking' || settings.includeVerifiedBookings) && (!item.eventId || item.eventId === eventId))
    // Demo cards are clearly labelled preview data and never enter the production rotation.
    const preview = isPreview ? [...configured, ...socialProofStore.previewItems()] : configured
    return preview.filter(item => isMobile ? item.mobileVisible : item.desktopVisible).slice(0, Math.max(1, Math.min(20, settings.maxCards ?? 20)))
  }, [eventId, isMobile, isPreview, socialProofVersion])

  useEffect(() => socialProofStore.subscribe(() => setSocialProofVersion(version => version + 1)), [])
  useEffect(() => {
    if (!eventId || isPreview) return
    let active = true
    setSocialProofReady(false)
    void socialProofStore.hydratePublic(eventId)
      .catch(error => { if (import.meta.env.DEV) console.warn('[social-proof] settings not loaded', { eventId, error }) })
      .finally(() => { if (active) setSocialProofReady(true) })
    return () => { active = false }
  }, [eventId, isPreview])

  // Detect mobile (md breakpoint = 768px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const hero = document.getElementById('hero')?.getBoundingClientRect()
      const tickets = document.getElementById('tickets')?.getBoundingClientRect()
      const footer = document.getElementById('footer')?.getBoundingClientRect()
      const footerVisible = Boolean(footer && footer.top < window.innerHeight && footer.bottom > 0)
      const nextShowBar = Boolean(hero && tickets && hero.bottom < 0 && !footerVisible && (tickets.top > window.innerHeight || tickets.bottom < 0))
      setShowBar(previous => previous === nextShowBar ? previous : nextShowBar)
    }
    update()
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', update); if (frame) cancelAnimationFrame(frame) }
  }, [])

  const { isChatActive, setOverlayActive } = useSocialProofOverlay()

  const handleOverlayTransitionStart = useCallback((phase: 'showing' | 'hiding') => {
    if (phase === 'showing') setOverlayActive(true)
  }, [setOverlayActive])

  const handleOverlayTransitionEnd = useCallback((phase: 'shown' | 'hidden') => {
    if (phase === 'hidden') setOverlayActive(false)
  }, [setOverlayActive])

  useEffect(() => {
    if (isChatActive) { setToast(null); return }
    const stored = Object.fromEntries(Object.entries({ ...socialProofStore.settings(), ...(settingsOverride ?? {}) }).filter(([, value]) => value !== undefined && value !== null)) as typeof socialProofStore extends never ? never : ReturnType<typeof socialProofStore.settings>
    const isDefaultTemplatePreview = isPreview && !eventId
    const settings = isDefaultTemplatePreview ? {
      ...stored,
      enabled: true,
      paused: false,
      mobileVisible: true,
      desktopVisible: true,
      pageTargeting: ['event'],
      delay: Math.min(stored.delay || 8, 3),
    } : stored
    const visibleOnDevice = isMobile ? settings.mobileVisible : settings.desktopVisible
    const blocked = !settings.enabled ? 'disabled' : settings.paused ? 'paused' : !socialProofReady ? 'settings not loaded' : !visibleOnDevice ? 'mobile/desktop visibility disabled' : !settings.pageTargeting?.includes('event') ? 'page target mismatch' : !notices.length ? 'no active records' : null
    if (blocked) {
      if (import.meta.env.DEV) console.info('[social-proof] popup not displayed', { eventId, reason: blocked, settings, notices: notices.length, override: settingsOverride })
      setToast(null)
      return
    }
    let timeout: ReturnType<typeof setTimeout>
    const next = () => {
      if (document.hidden) { timeout = setTimeout(next, settings.delay * 1000); return }
      const choices = notices.filter(item => !played.current.has(item.id))
      const item = choices[Math.floor(Math.random() * choices.length)] ?? notices[Math.floor(Math.random() * notices.length)]
      if (!item) return
      played.current.add(item.id)
      if (played.current.size >= notices.length) played.current.clear()
      setToast({ ...item, duration: settings.duration ?? item.duration })
      timeout = setTimeout(() => {
        setToast(null)
        timeout = setTimeout(next, settings.delay * 1000)
      }, (settings.duration ?? item.duration) * 1000)
    }
    timeout = setTimeout(next, settings.delay * 1000)
    return () => clearTimeout(timeout)
  }, [eventId, isChatActive, isMobile, isPreview, notices, settingsOverride, socialProofReady, socialProofVersion])

  return (
    <>
      {toast && isMobile ? (
        <MobileSocialProofOverlay
          item={toast}
          onDismiss={() => setToast(null)}
          onTransitionStart={handleOverlayTransitionStart}
          onTransitionEnd={handleOverlayTransitionEnd}
        />
      ) : toast ? (
        <div className={`social-proof-desktop fixed z-[135] flex w-auto max-w-[min(26rem,calc(100%_-_2rem))] items-start gap-3.5 rounded-2xl p-4 shadow-2xl animate-[fade-in-up_.3s_ease] ${positionClass[toast.position]}`}
          style={{ background: t.isDark ? 'rgba(18,18,22,0.95)' : 'rgba(255,255,255,0.98)', border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.12)' : t.border}`, color: t.text, boxShadow: t.isDark ? '0 16px 48px rgba(0,0,0,0.5)' : '0 14px 32px rgba(23,26,31,0.12), 0 2px 6px rgba(23,26,31,0.04)' }}>
          <div className="relative shrink-0 mt-0.5">
            {toast.avatar ? (
              <img src={toast.avatar} width="40" height="40" className="social-proof-avatar h-10 w-10 rounded-full object-cover ring-2 ring-white/10 shadow-sm" alt={toast.name}/>
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold"
                style={{ background: t.isDark ? 'rgba(0,255,136,0.15)' : `${t.accent}10`, color: t.accent }}>
                {toast.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            {toast.sourceType === 'verified_booking' && <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-zinc-900 text-[8px] text-zinc-950 font-bold">✓</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-1 pr-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-xs font-bold tracking-tight truncate max-w-[160px]" style={{ color: t.text }}>
                {toast.name}
              </span>
              <span className="text-[11px] font-medium shrink-0" style={{ color: t.textMuted }}>
                {toast.city}{toast.state ? `, ${toast.state}` : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: t.isDark ? 'rgba(255,255,255,0.85)' : t.textSub }}>
              <span>{(toast.sourceType === 'verified_booking' ? translations.socialProof.justPurchased : toast.message).replace(/\.?$/, '')}</span>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase shrink-0"
                style={{ background: t.isDark ? 'rgba(0,255,136,0.12)' : `${t.accent}10`, color: t.isDark ? '#00FF88' : t.accent, border: `1px solid ${t.isDark ? 'rgba(0,255,136,0.3)' : `${t.accent}30`}` }}>
                {toast.ticketPackage}
              </span>
            </div>
            <div className="flex items-center justify-between pt-0.5 text-[10px]" style={{ color: t.textMuted }}>
              <span>{toast.sourceType === 'demo' ? 'Demo preview' : toast.sourceType === 'manual_message' ? 'Promotion' : translations.socialProof.recentBooking}</span>
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: t.isDark ? '#34D399' : '#059669' }}>
                <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {toast.sourceType === 'demo' ? 'Preview data' : toast.sourceType === 'manual_message' ? 'Message' : translations.socialProof.verified}
              </span>
            </div>
          </div>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification" className="hover:opacity-70 transition-opacity p-0.5 text-lg leading-none" style={{ color: t.textMuted }}>×</button>
        </div>
      ) : null}

      {showBar && (
        <div className="mobile-booking-island fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[130] flex items-center gap-3 p-3 backdrop-blur md:hidden"
          style={{
            background: t.isDark ? 'rgba(9,9,11,0.95)' : 'rgba(255,255,255,0.95)',
            border: `1px solid ${t.isDark ? '#10b981' : t.accent}`,
            color: t.text,
            boxShadow: t.isDark ? '0 10px 25px rgba(0,0,0,0.5)' : '0 12px 28px rgba(23,26,31,0.12)',
            borderRadius: '1rem'
          }}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: t.textMuted }}>{translations.conversion.ticketsFrom}</p>
            <p className="text-sm font-bold" style={{ color: t.text }}>
              {Number.isFinite(startingPrice) ? formatPrice(startingPrice) : '—'}
              <span className="text-xs font-normal" style={{ color: t.textMuted }}> · {available} {translations.conversion.left}</span>
            </p>
          </div>
          <button type="button" onClick={() => document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-2xl px-5 py-3 text-xs font-bold transition-all hover:-translate-y-0.5"
            style={{ background: t.isDark ? `${t.accent}18` : `linear-gradient(135deg,${t.accent},${t.accentDim})`, color: t.isDark ? t.accent : t.accentText, border: t.isDark ? `1px solid ${t.accent}40` : 'none', boxShadow: t.isDark ? `0 8px 24px ${t.accentGlow}` : `0 4px 16px ${t.accentGlow}` }}>
            {translations.conversion.getTickets}
          </button>
        </div>
      )}
    </>
  )
}

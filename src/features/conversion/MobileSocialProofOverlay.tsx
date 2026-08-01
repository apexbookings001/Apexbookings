import { useEffect, useState, useRef, useCallback } from 'react'
import type { SocialProofItem } from './socialProofStore'
import { useTheme } from '../../theme'

const PACKAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Regular': { bg: 'rgba(113,113,122,0.15)', text: '#A1A1AA', border: 'rgba(113,113,122,0.3)' },
  'VIP': { bg: 'rgba(0,255,136,0.12)', text: '#00FF88', border: 'rgba(0,255,136,0.3)' },
  'VVIP': { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', border: 'rgba(245,158,11,0.3)' },
  'Gold': { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', border: 'rgba(245,158,11,0.3)' },
  'Platinum': { bg: 'rgba(139,92,246,0.12)', text: '#A78BFA', border: 'rgba(139,92,246,0.3)' },
  'Early Bird': { bg: 'rgba(34,211,238,0.12)', text: '#22D3EE', border: 'rgba(34,211,238,0.3)' },
  'Student': { bg: 'rgba(34,211,238,0.12)', text: '#22D3EE', border: 'rgba(34,211,238,0.3)' },
  'Corporate': { bg: 'rgba(139,92,246,0.12)', text: '#A78BFA', border: 'rgba(139,92,246,0.3)' },
}

type Phase = 'entering' | 'visible' | 'leaving' | 'hidden'

export function MobileSocialProofOverlay({
  item,
  onDismiss,
  onTransitionStart,
  onTransitionEnd,
}: {
  item: SocialProofItem
  onDismiss: () => void
  onTransitionStart?: (phase: 'showing' | 'hiding') => void
  onTransitionEnd?: (phase: 'shown' | 'hidden') => void
}) {
  const { t } = useTheme()
  const [phase, setPhase] = useState<Phase>('entering')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefersReducedMotion = useRef(false)

  const pkgColor = t.isDark ? (PACKAGE_COLORS[item.ticketPackage] ?? PACKAGE_COLORS['Regular']) : { bg: `${t.accent}10`, text: t.accent, border: `${t.accent}30` }

  // Check for reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.current = mq.matches
    const handler = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const dismiss = useCallback(() => {
    if (phase === 'leaving' || phase === 'hidden') return
    setPhase('leaving')
    onTransitionStart?.('hiding')
    if (timerRef.current) clearTimeout(timerRef.current)
    // After fade-out animation completes
    setTimeout(() => {
      setPhase('hidden')
      onTransitionEnd?.('hidden')
      onDismiss()
    }, prefersReducedMotion.current ? 150 : 250)
  }, [phase, onDismiss, onTransitionStart, onTransitionEnd])

  // Enter animation
  useEffect(() => {
    onTransitionStart?.('showing')
    const enterDuration = prefersReducedMotion.current ? 100 : 250
    const enterTimer = setTimeout(() => {
      setPhase('visible')
      onTransitionEnd?.('shown')
    }, enterDuration)

    // Auto-dismiss after 4-5 seconds
    const stayDuration = (item.duration || 5) * 1000
    timerRef.current = setTimeout(() => {
      dismiss()
    }, stayDuration)

    return () => {
      clearTimeout(enterTimer)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'hidden') return null

  const isAnimating = phase === 'entering' || phase === 'leaving'
  const reduceMotion = prefersReducedMotion.current

  // Format time ago
  const timeAgo = (() => {
    const created = new Date(item.createdAt)
    const now = new Date()
    const diffMs = now.getTime() - created.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  })()

  // Format clean message line
  const cleanMessage = (() => {
    if (item.message) {
      let msg = item.message.trim()
      if (msg.endsWith('.')) msg = msg.slice(0, -1)
      return msg
    }
    return 'just purchased a ticket'
  })()

  return (
    <div
      className="social-proof-mobile fixed left-1/2 z-[135] w-[calc(100%-1.25rem)] max-w-[440px]"
      style={{
        top: `max(4.75rem, calc(env(safe-area-inset-top, 0px) + 4rem))`,
        transform: 'translateX(-50%)',
        opacity: isAnimating ? 0 : 1,
        transition: reduceMotion
          ? 'opacity 150ms ease'
          : 'opacity 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...(reduceMotion ? {} : {
          transform: isAnimating
            ? 'translateX(-50%) scale(0.96)'
            : 'translateX(-50%) scale(1)',
          transition: 'opacity 250ms cubic-bezier(0.16, 1, 0.3, 1), transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        }),
      }}
    >
      <div
        className="relative flex items-start gap-3.5 p-4"
        style={{
          background: t.isDark
            ? 'rgba(18, 18, 22, 0.94)'
            : 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(28px) saturate(190%)',
          WebkitBackdropFilter: 'blur(28px) saturate(190%)',
          borderRadius: '20px',
          border: `1px solid ${t.isDark ? 'rgba(255, 255, 255, 0.12)' : t.border}`,
          boxShadow: t.isDark
            ? '0 12px 36px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            : '0 14px 32px rgba(23, 26, 31, 0.12), 0 2px 6px rgba(23, 26, 31, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        }}
      >
        {/* Avatar with verified badge */}
        <div className="relative shrink-0 mt-0.5">
          {item.avatar ? (
            <img
              src={item.avatar}
              alt={item.name}
              className="social-proof-avatar h-11 w-11 rounded-full object-cover ring-2 ring-white/10 shadow-sm"
            />
          ) : (
            <div
              className="grid h-11 w-11 place-items-center rounded-full text-xs font-bold shadow-sm"
              style={{
                background: t.isDark ? 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,200,102,0.1))' : `${t.accent}10`,
                color: t.isDark ? '#00FF88' : t.accent,
                border: `1px solid ${t.isDark ? 'rgba(0,255,136,0.3)' : `${t.accent}28`}`,
              }}
            >
              {item.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          {item.sourceType === 'verified_booking' && <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-zinc-900 text-[8px] text-zinc-950 font-bold">✓</span>}
        </div>

        {/* Content Container - Well structured & spread out */}
        <div className="min-w-0 flex-1 space-y-1.5 pr-5">
          {/* Row 1: Name and Location */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold tracking-tight truncate max-w-[180px]" style={{ color: t.text }}>
              {item.name}
            </span>
            <span className="text-[11px] font-medium shrink-0" style={{ color: t.textMuted }}>
              {item.city}{item.state ? `, ${item.state}` : ''}
            </span>
          </div>

          {/* Row 2: Message & Package Pill */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: t.isDark ? 'rgba(255,255,255,0.85)' : t.textSub }}>
            <span>{cleanMessage}</span>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase shadow-xs shrink-0"
              style={{
                background: pkgColor.bg,
                color: pkgColor.text,
                border: `1px solid ${pkgColor.border}`,
              }}
            >
              {item.ticketPackage}
            </span>
          </div>

          {/* Row 3: Time & Verified badge */}
          <div className="flex items-center justify-between pt-0.5 text-[10px]" style={{ color: t.textMuted }}>
            <span>{timeAgo}</span>
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: t.isDark ? '#34D399' : '#059669' }}>
              <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {item.sourceType === 'demo' ? 'Demo preview' : item.sourceType === 'manual_message' ? 'Promotion' : 'Verified Booking'}
            </span>
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            dismiss()
          }}
          aria-label="Dismiss notification"
          className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: t.textMuted }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import type { BookingPackage } from './bookingTemplate'
import { seatService } from './seatService'
import { supabase } from '../../lib/supabase'
import { formatCountdown, getCountdownState, type EventCountdownSettings } from './countdown'

function useTrustedNow(serverTime?: string, settings?: EventCountdownSettings, eventStartsAt?: string) {
  const offset = useMemo(() => {
    const parsed = Date.parse(serverTime ?? '')
    return Number.isFinite(parsed) ? parsed - Date.now() : 0
  }, [serverTime])
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    let interval: number | undefined
    const update = () => {
      if (!document.hidden) setNow(Date.now() + offset)
    }
    const schedule = () => {
      window.clearInterval(interval)
      // The header displays seconds, so its single controlled clock ticks once
      // per second and derives every value from the persisted end timestamp.
      interval = window.setInterval(update, 1000)
    }
    const visible = () => { update(); schedule() }
    schedule()
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible) }
  }, [eventStartsAt, offset, settings])
  return now
}

export function TicketSalesCountdown({ settings, eventStartsAt, eventId, packages, serverTime, preview = false, onSalesOpenChange }: {
  settings?: EventCountdownSettings
  eventStartsAt?: string
  eventId?: string
  packages: BookingPackage[]
  serverTime?: string
  preview?: boolean
  onSalesOpenChange?: (open: boolean) => void
}) {
  const now = useTrustedNow(serverTime, settings, eventStartsAt)
  const state = getCountdownState(settings, eventStartsAt, now)
  const [available, setAvailable] = useState<number | null>(null)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 375)

  useEffect(() => onSalesOpenChange?.(!state.closed), [onSalesOpenChange, state.closed])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 374px)')
    const update = () => setNarrow(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!eventId || preview) return
    let active = true
    const load = async () => {
      const rows = await Promise.all(packages.map(item => seatService.listPublic(eventId, item.id)))
      if (active) setAvailable(rows.flat().filter(seat => seat.status === 'available').length)
    }
    void load().catch(() => { if (active) setAvailable(null) })
    const channel = supabase?.channel(`public-countdown-seat-count:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seats', filter: `event_id=eq.${eventId}` }, () => { void load().catch(() => undefined) })
      .subscribe()
    return () => { active = false; if (channel && supabase) void supabase.removeChannel(channel) }
  }, [eventId, packages, preview])

  if (!state.visible) return null
  const remainingOverDay = state.remainingMs >= 86400000
  const timeText = state.closed ? '—' : formatCountdown(state.remainingMs, narrow && remainingOverDay)
  const urgency = state.remainingMs < 3600000 ? 'border-amber-300/60 shadow-[0_0_18px_rgba(251,191,36,.14)]' : state.remainingMs < 21600000 ? 'border-emerald-300/50' : state.remainingMs < 86400000 ? 'border-emerald-400/45' : 'border-emerald-400/25'
  const availability = available === null ? null : `${available} ${available === 1 ? 'seat' : 'seats'} available`
  return (
    <>
      <div aria-label={state.closed ? 'Ticket sales have closed' : `${state.label}: ${timeText}`} className={`hidden min-w-0 items-center gap-2 rounded-lg border bg-zinc-950/75 px-2.5 py-1.5 xl:flex ${urgency}`}>
        <span className="max-w-36 truncate text-[10px] font-semibold text-zinc-300">{state.label}</span>
        <time dateTime={state.endAt ? new Date(state.endAt).toISOString() : undefined} className="whitespace-nowrap font-mono text-xs font-bold tabular-nums text-emerald-300">{timeText}</time>
        {availability && <span className="whitespace-nowrap text-[10px] font-semibold text-zinc-300">· {availability}</span>}
      </div>
      <div aria-label={state.closed ? 'Ticket sales have closed' : `${state.label}: ${timeText}`} className={`order-last mt-2 grid w-full min-w-0 basis-full gap-1 border-t pt-2 xl:hidden ${urgency.includes('amber') ? 'border-amber-300/45' : 'border-emerald-400/25'}`}>
        <div className="flex min-w-0 items-start justify-between gap-3 text-[11px] font-semibold leading-4"><span className="min-w-0 text-zinc-200">{state.label}</span>{availability && <span className="shrink-0 text-emerald-200">{availability}</span>}</div>
        <time dateTime={state.endAt ? new Date(state.endAt).toISOString() : undefined} className="font-mono text-sm font-bold tabular-nums text-emerald-300">{timeText}</time>
      </div>
    </>
  )
}

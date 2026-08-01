import { useState, useEffect, useCallback, useMemo } from 'react'
import type { SeatRecord } from './seatService'
import { isDatabaseSeatRecord, seatService } from './seatService'
import { requireSupabase } from '../../services/supabase/client'

type PublicSeatStatus = 'available' | 'selected' | 'unavailable'

const STATUS_STYLE: Record<PublicSeatStatus, { bg: string; border: string; text: string; cursor: string; label: string }> = {
  available: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', text: '#A1A1AA', cursor: 'pointer', label: 'Available' },
  selected:  { bg: 'rgba(0,255,136,0.22)',   border: '#00FF88',                text: '#00FF88', cursor: 'pointer', label: 'Selected' },
  unavailable: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)', text: '#3f3f46', cursor: 'not-allowed', label: 'Already taken / unavailable' },
}

export function PublicSeatSelector({
  eventId,
  packageId,
  selectedSeatId,
  onSelect,
  onSeatsChange,
  refreshToken = 0,
  onAttemptTaken,
  accent = '#00FF88',
  selectionEnabled = true,
  seatsOverride,
  allowDraftSeats = false,
}: {
  eventId: string
  packageId: string
  selectedSeatId: string | null
  onSelect: (seat: SeatRecord) => void
  onSeatsChange?: (seats: SeatRecord[], loading: boolean) => void
  refreshToken?: number
  onAttemptTaken?: (label: string) => void
  accent?: string
  selectionEnabled?: boolean
  /** Editor-only current draft. Published checkout never supplies this. */
  seatsOverride?: SeatRecord[]
  allowDraftSeats?: boolean
}) {
  const [seats, setSeats] = useState<SeatRecord[]>([])
  const [loading, setLoading] = useState(seatsOverride === undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (seatsOverride !== undefined) {
      setSeats(seatsOverride)
      setLoading(false)
      setError(null)
      return
    }
    if (!eventId || !packageId) return
    setLoading(true)
    setError(null)
    try {
      // Release expired reservations first so seat list is fresh
      await seatService.releaseExpired().catch(() => 0)
      const data = await seatService.listPublic(eventId, packageId)
      setSeats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seats')
    } finally {
      setLoading(false)
    }
  }, [eventId, packageId, seatsOverride])

  useEffect(() => { void load() }, [load, refreshToken])

  const duplicateLabels = useMemo(() => new Set(seats.filter((seat, index) => seats.findIndex(item => item.label === seat.label) !== index).map(seat => seat.label)), [seats])
  const validSeats = useMemo(() => seats.filter(seat => {
    const belongsToPackage = seat.eventId === eventId && seat.packageId === packageId
    return belongsToPackage && !duplicateLabels.has(seat.label) && (allowDraftSeats || isDatabaseSeatRecord(seat, eventId, packageId))
  }), [allowDraftSeats, duplicateLabels, eventId, packageId, seats])
  const invalidCount = seats.length - validSeats.length

  useEffect(() => {
    onSeatsChange?.(validSeats, loading)
  }, [loading, onSeatsChange, validSeats])

  // Realtime subscription — cross-device availability
  useEffect(() => {
    if (seatsOverride !== undefined) return
    if (!eventId || !packageId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ch: any = null
    try {
      const sb = requireSupabase()
      ch = sb
        .channel(`public-seats-${packageId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'seats',
          filter: `event_id=eq.${eventId}`,
        }, () => { void load() })
        .subscribe()
    } catch { /* Supabase not available */ }
    return () => {
      if (ch) { try { void requireSupabase().removeChannel(ch) } catch { /* */ } }
    }
  }, [eventId, packageId, load, seatsOverride])

  const getStatus = (seat: SeatRecord): PublicSeatStatus => {
    if (seat.id === selectedSeatId) return 'selected'
    return seat.status === 'available' ? 'available' : 'unavailable'
  }

  const availableCount = validSeats.filter(s => s.status === 'available').length
  const totalCount = validSeats.length

  if (loading && seats.length === 0) {
    return (
      <div className="py-6 text-center text-sm animate-pulse" style={{ color: '#A1A1AA' }}>
        Loading available seats…
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
        ⚠ {error}
        <button onClick={() => void load()} className="block mx-auto mt-2 text-xs underline">Retry</button>
      </div>
    )
  }

  if (validSeats.length === 0) {
    return (
      <div className="py-4 text-center text-sm" style={{ color: '#A1A1AA' }}>
        No valid seats are configured for this package.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!selectionEnabled && <div className="rounded-xl border border-white/10 bg-white/[.025] px-3 py-2 text-center text-xs text-zinc-300">A seat is assigned automatically for this package. The full seating layout remains visible.</div>}
      {/* Seat legend */}
      <div className="flex flex-wrap gap-3 justify-center text-[10px] font-mono" style={{ color: '#71717A' }}>
        {(Object.entries(STATUS_STYLE) as [PublicSeatStatus, typeof STATUS_STYLE[PublicSeatStatus]][]).map(([status, style]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: style.bg, border: `1px solid ${style.border}` }} />
            {style.label}
          </span>
        ))}
      </div>

      {/* Availability count */}
      <div className="text-center text-xs font-mono" style={{ color: availableCount < 10 ? '#EF4444' : '#A1A1AA' }}>
        {availableCount} of {totalCount} seats available
      </div>

      {import.meta.env.DEV && invalidCount > 0 && (
        <div className="rounded-xl px-3 py-2 text-center text-xs" style={{ background: 'rgba(245,158,11,0.12)', color: '#FCD34D' }}>
          Configuration warning: {invalidCount} invalid or duplicate seat record{invalidCount === 1 ? '' : 's'} excluded from checkout.
        </div>
      )}

      {/* Seat grid */}
      <div
        className="flex flex-wrap gap-1.5 justify-center"
        style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}
        role="listbox"
        aria-label="Seat selection"
      >
        {validSeats.map(seat => {
          const status = getStatus(seat)
          const style = STATUS_STYLE[status]
          const isSelectable = selectionEnabled && (status === 'available' || status === 'selected')
          const shortLabel = seat.label.split('-').pop() ?? seat.label

          return (
            <button
              key={seat.id}
              role="option"
              aria-selected={status === 'selected'}
              aria-label={`Seat ${seat.label} — ${style.label}`}
              title={`${seat.label} — ${style.label}`}
              className="rounded-lg text-[10px] font-mono font-bold transition-all duration-150 flex items-center justify-center"
              style={{
                width: 48,
                height: 38,
                background: style.bg,
                border: `1.5px solid ${style.border}`,
                color: style.text,
                cursor: style.cursor,
                transform: status === 'selected' ? 'translateY(-2px) scale(1.08)' : undefined,
                boxShadow: status === 'selected' ? `0 6px 18px ${accent}35` : undefined,
              }}
              onClick={() => {
                if (isSelectable) {
                  onSelect(seat)
                } else {
                  onAttemptTaken?.(selectionEnabled ? seat.label : 'Seat selection is not enabled for this package')
                }
              }}
            >
              {shortLabel}
            </button>
          )
        })}
      </div>

      {availableCount === 0 && (
        <div className="text-center text-sm font-semibold py-2 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
          All seats in this package are taken
        </div>
      )}
    </div>
  )
}

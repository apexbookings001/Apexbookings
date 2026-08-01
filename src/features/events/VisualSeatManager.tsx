import { useState, useEffect, useCallback, useRef } from 'react'
import type { SeatRecord } from './seatService'
import { seatService } from './seatService'
import { requireSupabase } from '../../services/supabase/client'

type SeatFilter = 'all' | 'available' | 'disabled'

const T = {
  bg2: '#111113',
  bg3: '#18181B',
  bg4: '#1E1E21',
  inputBg: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.08)',
  text: '#FAFAFA',
  textSub: '#A1A1AA',
  textMuted: '#52525B',
  emerald: '#00FF88',
  gold: '#F59E0B',
  red: '#EF4444',
  purple: '#8B5CF6',
  cyan: '#22D3EE',
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  available: { bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.3)', text: '#00FF88', label: 'Available' },
  disabled: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', text: '#EF4444', label: 'Unavailable' },
  reserved: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.4)', text: '#8B5CF6', label: 'Reserved' },
  sold: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B', label: 'Sold' },
  selected: { bg: 'rgba(34,211,238,0.18)', border: '#22D3EE', text: '#22D3EE', label: 'Selected' },
}

function SeatButton({
  seat,
  isSelected,
  onClick,
}: {
  seat: SeatRecord
  isSelected: boolean
  onClick: (id: string, label: string, shift: boolean) => void
}) {
  const isSold = seat.status === 'sold'
  const isReserved = seat.status === 'reserved'
  const isProtected = isSold || isReserved
  // Reserved and sold are protected backend states; this setup UI exposes
  // them only as unavailable, never as manually editable states.
  const colors = isSelected
    ? STATUS_COLORS.selected
    : STATUS_COLORS[isProtected ? 'disabled' : seat.status] ?? STATUS_COLORS.available

  return (
    <button
      title={`${seat.label} — ${isSelected ? 'Selected' : colors.label}${isSold ? ' (protected)' : ''}`}
      className="rounded-lg text-[9px] font-mono font-bold transition-all duration-150 flex items-center justify-center"
      style={{
        width: 44,
        height: 36,
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        color: colors.text,
        cursor: isProtected ? 'not-allowed' : 'pointer',
        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
        boxShadow: isSelected ? `0 0 10px ${T.cyan}40` : 'none',
        opacity: isProtected ? 0.7 : 1,
      }}
      onClick={e => {
        if (isProtected) return
        onClick(seat.id, seat.label, e.shiftKey)
      }}
    >
      {seat.label.split('-').pop() ?? seat.label}
    </button>
  )
}

export function VisualSeatManager({
  eventId,
  packageId,
  packageName,
  totalAllocated,
  onStatsChange,
}: {
  eventId: string
  packageId: string
  packageName: string
  totalAllocated: number
  onStatsChange?: (available: number, total: number) => void
}) {
  const [seats, setSeats] = useState<SeatRecord[]>([])
  // Use a plain string[] for selected IDs. A Set causes stale-closure problems
  // when read inside async handlers because React state updates are batched.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filter, setFilter] = useState<SeatFilter>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const lastClickedLabel = useRef<string | null>(null)

  // Use a ref for onStatsChange to keep it out of useCallback deps.
  // An inline prop function is recreated every render — including it in deps
  // would cause load() to change → useEffect re-runs → infinite fetch loop.
  const onStatsChangeRef = useRef(onStatsChange)
  useEffect(() => { onStatsChangeRef.current = onStatsChange }, [onStatsChange])

  // Keep a ref of the current seats array so async handlers always read the
  // latest value, even if a stale closure captured an older render's seats.
  const seatsRef = useRef(seats)
  useEffect(() => { seatsRef.current = seats }, [seats])

  // Keep a ref of the current selected IDs for the same reason.
  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])

  // Request counter: discards responses from superseded requests.
  const requestSeq = useRef(0)

  // ─── Seat loading ──────────────────────────────────────────────────────────
  const load = useCallback(async (ensureCount?: number) => {
    if (!eventId || !packageId) return

    const seq = ++requestSeq.current
    setLoading(true)
    setLoadError(null)

    try {
      let data = await seatService.listAdmin(eventId, packageId)

      // If seats are missing from the DB but the package has an allocation,
      // auto-generate the missing rows idempotently then re-fetch.
      const needed = ensureCount ?? 0
      if (data.length < needed && needed > 0) {
        const missing = needed - data.length
        setSuccessMsg(`Configuration warning: ${data.length} of ${needed} seat records found. Reconciling ${missing} missing record${missing === 1 ? '' : 's'}…`)
        await seatService.ensureSeats(eventId, packageId, needed)
        data = await seatService.listAdmin(eventId, packageId)
        setSuccessMsg(`Seat configuration reconciled: ${data.length} of ${needed} records are now available.`)
      }

      if (seq !== requestSeq.current) return

      setSeats(data)
      setLoadError(null)
      const avail = data.filter(s => s.status === 'available').length
      onStatsChangeRef.current?.(avail, data.length)
    } catch (err) {
      if (seq !== requestSeq.current) return
      console.error('[VisualSeatManager] seat load failed', {
        eventId,
        packageId,
        message: err instanceof Error ? err.message : String(err),
        code: (err as Record<string, unknown>)?.code,
      })
      setSeats([])
      setLoadError(err instanceof Error ? err.message : 'Failed to load seats')
    } finally {
      if (seq !== requestSeq.current) return
      setLoading(false)
    }
  }, [eventId, packageId])

  // Initial load + re-load when eventId or packageId changes.
  // totalAllocated triggers ensureSeats if seat rows are missing.
  useEffect(() => { void load(totalAllocated) }, [load, totalAllocated])

  // Realtime subscription — only while panel is expanded to avoid competing requests.
  useEffect(() => {
    if (!eventId || !isExpanded) return
    try {
      const sb = requireSupabase()
      const channel = sb
        .channel(`vsm-${packageId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'seats',
          filter: `event_id=eq.${eventId}`,
        }, () => { void load() })
        .subscribe()
      return () => { void sb.removeChannel(channel) }
    } catch {
      return undefined
    }
  }, [eventId, packageId, isExpanded, load])

  // ─── Seat click (single + shift-range) ─────────────────────────────────────
  const handleSeatClick = useCallback((id: string, label: string, isShift: boolean) => {
    const currentSeats = seatsRef.current
    const seat = currentSeats.find(s => s.id === id)
    if (!seat || seat.status === 'sold' || seat.status === 'reserved') return

    if (isShift && lastClickedLabel.current) {
      // Range selection — include available and disabled, skip sold
      const labels = currentSeats.map(s => s.label)
      const fromIdx = labels.indexOf(lastClickedLabel.current)
      const toIdx = labels.indexOf(label)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
        const rangeIds = currentSeats
          .slice(lo, hi + 1)
          .filter(s => s.status === 'available' || s.status === 'disabled')
          .map(s => s.id)
        setSelectedIds(prev => {
          const added = rangeIds.filter(rid => !prev.includes(rid))
          return [...prev, ...added]
        })
        lastClickedLabel.current = label
        return
      }
    }

    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    )
    lastClickedLabel.current = label
  }, [])   // seatsRef is a ref — safe to omit from deps

  // ─── Bulk Mark Unavailable ──────────────────────────────────────────────────
  const handleMarkUnavailable = async () => {
    // Read from refs to guarantee we have the latest values — not stale closures
    const currentSeats = seatsRef.current
    const currentSelectedIds = selectedIdsRef.current

    // Only disable seats that are currently 'available'
    const eligibleIds = currentSelectedIds.filter(id => {
      const s = currentSeats.find(seat => seat.id === id)
      return s?.status === 'available'
    })

    if (!eligibleIds.length) {
      setActionError(
        'No available seats in your selection to mark as unavailable. ' +
        'Reserved and sold seats cannot be changed.'
      )
      return
    }

    setSaving(true)
    setActionError(null)
    setSuccessMsg(null)

    try {
      // bulkDisable: uses event_id + package_id + status='available' pre-condition
      // and returns the updated rows for immediate local state application.
      const updated = await seatService.bulkDisable(eligibleIds, eventId, packageId)

      // Apply the returned rows directly to local state — no extra DB round-trip.
      setSeats(prev => {
        const updatedMap = new Map(updated.map(r => [r.id, r]))
        return prev.map(s => updatedMap.get(s.id) ?? s)
      })
      setSelectedIds([])
      setSuccessMsg(`${updated.length} seat${updated.length !== 1 ? 's' : ''} marked unavailable.`)
      // Update the stats callback from the freshly-merged local state
      const next = seatsRef.current.map(s => {
        const u = updated.find(r => r.id === s.id)
        return u ?? s
      })
      const avail = next.filter(s => s.status === 'available').length
      onStatsChangeRef.current?.(avail, next.length)
    } catch (err) {
      console.error('[VisualSeatManager] bulkDisable failed', {
        eventId,
        packageId,
        eligibleCount: eligibleIds.length,
        message: err instanceof Error ? err.message : String(err),
      })
      setActionError(err instanceof Error ? err.message : 'Failed to mark seats unavailable')
    } finally {
      setSaving(false)
    }
  }

  // ─── Bulk Mark Available ────────────────────────────────────────────────────
  const handleMarkAvailable = async () => {
    const currentSeats = seatsRef.current
    const currentSelectedIds = selectedIdsRef.current

    // Only re-enable seats that are currently 'disabled'
    const eligibleIds = currentSelectedIds.filter(id => {
      const s = currentSeats.find(seat => seat.id === id)
      return s?.status === 'disabled'
    })

    if (!eligibleIds.length) {
      setActionError(
        'No unavailable seats in your selection to restore. ' +
        'Only seats currently marked unavailable can be restored.'
      )
      return
    }

    setSaving(true)
    setActionError(null)
    setSuccessMsg(null)

    try {
      const updated = await seatService.bulkEnable(eligibleIds, eventId, packageId)

      setSeats(prev => {
        const updatedMap = new Map(updated.map(r => [r.id, r]))
        return prev.map(s => updatedMap.get(s.id) ?? s)
      })
      setSelectedIds([])
      setSuccessMsg(`${updated.length} seat${updated.length !== 1 ? 's' : ''} restored to available.`)
      const next = seatsRef.current.map(s => {
        const u = updated.find(r => r.id === s.id)
        return u ?? s
      })
      const avail = next.filter(s => s.status === 'available').length
      onStatsChangeRef.current?.(avail, next.length)
    } catch (err) {
      console.error('[VisualSeatManager] bulkEnable failed', {
        eventId,
        packageId,
        eligibleCount: eligibleIds.length,
        message: err instanceof Error ? err.message : String(err),
      })
      setActionError(err instanceof Error ? err.message : 'Failed to restore seats to available')
    } finally {
      setSaving(false)
    }
  }

  // ─── Derived state ──────────────────────────────────────────────────────────

  // Filter is applied locally — never triggers a Supabase request
  const filteredSeats = seats.filter(s => filter === 'all' || s.status === filter)

  // Counts from actual loaded seat records, not from the allocation prop
  const stats = {
    total: seats.length,
    available: seats.filter(s => s.status === 'available').length,
    disabled: seats.filter(s => s.status === 'disabled').length,
    reserved: seats.filter(s => s.status === 'reserved').length,
    sold: seats.filter(s => s.status === 'sold').length,
  }

  const selectedCount = selectedIds.length

  // Counts of what actions are available given the current selection
  const canDisableCount = selectedIds.filter(id => {
    const s = seats.find(seat => seat.id === id)
    return s?.status === 'available'
  }).length

  const canEnableCount = selectedIds.filter(id => {
    const s = seats.find(seat => seat.id === id)
    return s?.status === 'disabled'
  }).length

  const emptyFilterMessage = (): string => {
    switch (filter) {
      case 'available': return 'No available seats.'
      case 'disabled': return 'No unavailable seats.'
      default: return 'No seats generated yet. Save the allocation to generate seats.'
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.cardBorder}`, background: T.bg2 }}>
      {/* ── Header (collapsed/expanded toggle) ─────────────────────────────── */}
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        style={{ background: T.bg3, borderBottom: isExpanded ? `1px solid ${T.border}` : 'none' }}
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold" style={{ color: T.text }}>
            {packageName} — {loading ? totalAllocated : stats.total} seats
          </div>
          <div className="flex gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald }}>
              {stats.available} avail
            </span>
            {stats.disabled > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(239,68,68,0.1)', color: T.red }}>
                {stats.disabled} unavail
              </span>
            )}
          </div>
        </div>
        <span style={{ color: T.textMuted, fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* ── Legend ───────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            {(['available', 'disabled'] as const).map(key => {
              const val = STATUS_COLORS[key]
              return (
              <span key={key} className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: T.textMuted }}>
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: val.bg, border: `1px solid ${val.border}` }} />
                {val.label}
              </span>
              )
            })}
          </div>

          {/* ── Toolbar ──────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            {/* Filter pills — purely local, never fetch from DB */}
            <div className="flex flex-wrap gap-1">
              {([
                ['all', `All (${stats.total})`],
                ['available', `Avail (${stats.available})`],
                ['disabled', `Unavail (${stats.disabled})`],
              ] as [SeatFilter, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFilter(val)}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-mono transition-all"
                  style={{
                    background: filter === val ? 'rgba(34,211,238,0.15)' : T.inputBg,
                    border: `1px solid ${filter === val ? 'rgba(34,211,238,0.5)' : T.border}`,
                    color: filter === val ? T.cyan : T.textSub,
                    fontWeight: filter === val ? 700 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Selection controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Select available — for Mark Unavailable workflow */}
              {stats.available > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    setSelectedIds(
                      seats.filter(s => s.status === 'available').map(s => s.id)
                    )
                  }
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: T.inputBg, color: T.textSub, border: `1px solid ${T.border}` }}
                >
                  Select all available
                </button>
              )}

              {/* Select unavailable — for Mark Available workflow */}
              {stats.disabled > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    setSelectedIds(
                      seats.filter(s => s.status === 'disabled').map(s => s.id)
                    )
                  }
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: T.inputBg, color: T.textSub, border: `1px solid ${T.border}` }}
                >
                  Select all unavailable
                </button>
              )}

              {selectedCount > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setSelectedIds([])}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: T.inputBg, color: T.textSub, border: `1px solid ${T.border}` }}
                >
                  Clear selection ({selectedCount})
                </button>
              )}
            </div>

            {/* Bulk action buttons — only shown when relevant seats are selected */}
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Mark Unavailable — only when available seats are selected */}
                {canDisableCount > 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleMarkUnavailable()}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-opacity"
                    style={{ background: 'rgba(239,68,68,0.12)', color: T.red, border: `1px solid rgba(239,68,68,0.3)` }}
                  >
                    {saving ? 'Updating seats…' : `Mark ${canDisableCount} Unavailable`}
                  </button>
                )}

                {/* Mark Available — only when disabled seats are selected */}
                {canEnableCount > 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleMarkAvailable()}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-opacity"
                    style={{ background: 'rgba(0,255,136,0.08)', color: T.emerald, border: `1px solid rgba(0,255,136,0.25)` }}
                  >
                    {saving ? 'Updating seats…' : `Restore ${canEnableCount} to Available`}
                  </button>
                )}

                {selectedCount > 0 && canDisableCount === 0 && canEnableCount === 0 && (
                  <span className="text-[10px] font-mono" style={{ color: T.textMuted }}>
                    {selectedCount} protected seat{selectedCount !== 1 ? 's' : ''} selected (reserved/sold — cannot be changed)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Success notice ────────────────────────────────────────────────── */}
          {successMsg && !actionError && (
            <div
              className="text-xs px-3 py-2 rounded-xl flex items-center justify-between"
              style={{ background: 'rgba(0,255,136,0.08)', color: T.emerald, border: `1px solid rgba(0,255,136,0.2)` }}
            >
              <span>✓ {successMsg}</span>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="ml-3 text-[10px] opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Load error (with Retry) ───────────────────────────────────────── */}
          {loadError && (
            <div className="text-xs px-3 py-2 rounded-xl space-y-1" style={{ background: 'rgba(239,68,68,0.1)', color: T.red }}>
              <div>⚠ {loadError}</div>
              <button
                type="button"
                onClick={() => void load()}
                className="underline text-[10px] font-semibold"
                style={{ color: T.red }}
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Action error (keep selection, show Retry hint) ────────────────── */}
          {actionError && !loadError && (
            <div
              className="text-xs px-3 py-2 rounded-xl space-y-1"
              style={{ background: 'rgba(239,68,68,0.1)', color: T.red }}
            >
              <div>⚠ {actionError}</div>
              <div className="text-[10px] opacity-75">Your selection has been kept — click the action button to retry.</div>
            </div>
          )}

          {/* ── Seat grid ─────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="text-xs animate-pulse py-4 text-center" style={{ color: T.textMuted }}>
              Loading seats…
            </div>
          ) : loadError ? null : filteredSeats.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: T.textMuted }}>
              {seats.length === 0
                ? 'No seats generated yet. Save the allocation to generate seats.'
                : emptyFilterMessage()}
            </div>
          ) : (
            <div
              className="flex flex-wrap gap-1.5 overflow-x-auto"
              style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}
              role="group"
              aria-label={`${packageName} seat grid`}
            >
              {filteredSeats.map(seat => (
                <SeatButton
                  key={seat.id}
                  seat={seat}
                  isSelected={selectedIds.includes(seat.id)}
                  onClick={handleSeatClick}
                />
              ))}
            </div>
          )}

          <div className="text-[10px] font-mono" style={{ color: T.textMuted }}>
            Shift+click to select a range. Seats already reserved or sold remain protected.
          </div>
        </div>
      )}
    </div>
  )
}

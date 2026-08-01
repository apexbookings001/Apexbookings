import { useEffect, useState, useCallback } from 'react'
import { requireSupabase } from '../../services/supabase/client'

export type CapacityStats = {
  totalCapacity: number
  allocated: number
  unallocated: number
  available: number
  reserved: number
  sold: number
  disabled: number
}

async function fetchCapacityStats(eventId: string, totalCapacity: number): Promise<CapacityStats> {
  const sb = requireSupabase()

  // Allocation is the declared capacity of active package rows, not the
  // number of seats generated so far. Seat rows only drive availability.
  const [{ data: seatData, error: seatError }, { data: packageData, error: packageError }] = await Promise.all([
    sb
    .from('seats')
    .select('status')
    .eq('event_id', eventId)
    .is('deleted_at', null),
    sb.from('packages').select('capacity').eq('event_id', eventId).is('deleted_at', null).eq('enabled', true),
  ])

  if (seatError) throw seatError
  if (packageError) throw packageError

  const seats = (seatData ?? []) as { status: string }[]
  const available = seats.filter(s => s.status === 'available').length
  const reserved = seats.filter(s => s.status === 'reserved').length
  const sold = seats.filter(s => s.status === 'sold').length
  const disabled = seats.filter(s => s.status === 'disabled').length
  const allocated = (packageData ?? []).reduce((sum, pkg) => sum + Math.max(0, Number(pkg.capacity ?? 0)), 0)

  return {
    totalCapacity,
    allocated,
    unallocated: Math.max(0, totalCapacity - allocated),
    available,
    reserved,
    sold,
    disabled,
  }
}

const T = {
  bg3: '#18181B',
  border: 'rgba(255,255,255,0.07)',
  text: '#FAFAFA',
  textSub: '#A1A1AA',
  textMuted: '#52525B',
  emerald: '#00FF88',
  gold: '#F59E0B',
  red: '#EF4444',
  cyan: '#22D3EE',
  purple: '#8B5CF6',
}

type StatPill = { label: string; value: number; color: string; emoji: string }

export function CapacitySummary({
  eventId,
  capacity,
  refreshTrigger = 0,
}: {
  eventId: string
  capacity: number
  refreshTrigger?: number
}) {
  const [stats, setStats] = useState<CapacityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!eventId) return
    // A zero capacity is an intentional, unconfigured duplicate state. It is
    // not a missing value and must render as an all-zero summary rather than
    // leaving the previous event's data (or a loading state) on screen.
    if (capacity <= 0) {
      setStats({ totalCapacity: 0, allocated: 0, unallocated: 0, available: 0, reserved: 0, sold: 0, disabled: 0 })
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchCapacityStats(eventId, capacity)
      .then(setStats)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false))
  }, [eventId, capacity])

  useEffect(() => { load() }, [load, refreshTrigger])

  // Realtime subscription for seats changes
  useEffect(() => {
    if (!eventId) return
    try {
      const sb = requireSupabase()
      const channel = sb
        .channel(`capacity-summary-${eventId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'seats', filter: `event_id=eq.${eventId}` }, () => { load() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'packages', filter: `event_id=eq.${eventId}` }, () => { load() })
        .subscribe()
      return () => { void sb.removeChannel(channel) }
    } catch {
      return undefined
    }
  }, [eventId, load])

  if (loading && !stats) {
    return (
      <div className="rounded-2xl p-4" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
        <div className="text-xs animate-pulse" style={{ color: T.textMuted }}>Loading capacity data…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl p-4" style={{ background: T.bg3, border: `1px solid rgba(239,68,68,0.2)` }}>
        <div className="text-xs" style={{ color: T.red }}>⚠ {error}</div>
      </div>
    )
  }

  if (!stats) return null

  const overAllocated = stats.allocated > stats.totalCapacity
  const allAllocated = stats.allocated === stats.totalCapacity
  const remaining = stats.totalCapacity - stats.allocated

  const pills: StatPill[] = [
    { label: 'Total Capacity', value: stats.totalCapacity, color: T.text, emoji: '🏟' },
    { label: 'Allocated', value: stats.allocated, color: overAllocated ? T.red : T.emerald, emoji: '📦' },
    { label: 'Unallocated', value: stats.unallocated, color: stats.unallocated > 0 ? T.gold : T.textMuted, emoji: '⬜' },
    { label: 'Available', value: stats.available, color: T.cyan, emoji: '✅' },
    { label: 'Reserved', value: stats.reserved, color: T.purple, emoji: '⏳' },
    { label: 'Sold', value: stats.sold, color: T.gold, emoji: '🎟' },
    { label: 'Unavailable', value: stats.disabled, color: T.red, emoji: '🚫' },
  ]

  return (
    <div className="rounded-2xl p-4 space-y-4" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Capacity Summary</div>
        <button onClick={load} className="text-[10px] px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: T.textMuted }}>Refresh</button>
      </div>

      {/* Allocation status banner */}
      <div
        className="rounded-xl px-4 py-2.5 text-sm font-semibold"
        style={{
          background: overAllocated
            ? 'rgba(239,68,68,0.12)'
            : allAllocated
              ? 'rgba(0,255,136,0.1)'
              : 'rgba(245,158,11,0.08)',
          border: `1px solid ${overAllocated ? 'rgba(239,68,68,0.3)' : allAllocated ? 'rgba(0,255,136,0.25)' : 'rgba(245,158,11,0.2)'}`,
          color: overAllocated ? T.red : allAllocated ? T.emerald : T.gold,
        }}
      >
        {overAllocated
          ? `⚠ Package allocations exceed capacity by ${stats.allocated - stats.totalCapacity} seats`
          : allAllocated
            ? `✓ All ${stats.totalCapacity} seats allocated`
            : `${remaining} seat${remaining !== 1 ? 's' : ''} remaining to allocate`}
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {pills.map(pill => (
          <div key={pill.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
            <div className="text-base mb-1">{pill.emoji}</div>
            <div className="text-lg font-bold font-mono" style={{ color: pill.color }}>{pill.value.toLocaleString()}</div>
            <div className="text-[10px] font-mono uppercase tracking-wider mt-0.5" style={{ color: T.textMuted }}>{pill.label}</div>
          </div>
        ))}
      </div>

      {/* Capacity bar */}
      {stats.totalCapacity > 0 && (
        <div>
          <div className="flex justify-between text-[10px] font-mono mb-1" style={{ color: T.textMuted }}>
            <span>0</span>
            <span>{stats.totalCapacity}</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (stats.allocated / stats.totalCapacity) * 100)}%`,
                background: overAllocated
                  ? T.red
                  : allAllocated
                    ? T.emerald
                    : 'linear-gradient(90deg, #00FF88, #F59E0B)',
              }}
            />
          </div>
          <div className="text-[10px] font-mono mt-1 text-right" style={{ color: T.textMuted }}>
            {Math.round((stats.allocated / stats.totalCapacity) * 100)}% allocated
          </div>
        </div>
      )}
    </div>
  )
}

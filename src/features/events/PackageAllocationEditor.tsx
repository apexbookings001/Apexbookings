import { useState, useEffect, useCallback } from 'react'
import type { TicketPackage } from './adminEventStore'
import { packageService, type PackageSeatStats } from './packageService'
import { seatService, seatPrefix } from './seatService'
import { VisualSeatManager } from './VisualSeatManager'
import { requireSupabase } from '../../services/supabase/client'

const T = {
  bg2: '#111113', bg3: '#18181B', bg4: '#1E1E21',
  cardSolid: '#111113', card: 'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.07)',
  inputBg: 'rgba(255,255,255,0.05)',
  text: '#FAFAFA', textSub: '#A1A1AA', textMuted: '#52525B',
  emerald: '#00FF88', emeraldGlow: 'rgba(0,255,136,0.18)',
  gold: '#F59E0B', red: '#EF4444', purple: '#8B5CF6', cyan: '#22D3EE',
}

type RemoveModalState = {
  pkg: TicketPackage
  stats: PackageSeatStats | null
  loading: boolean
}

function AllocationBar({ allocated, capacity }: { allocated: number; capacity: number }) {
  if (capacity <= 0) return null
  const pct = Math.min(100, (allocated / capacity) * 100)
  const over = allocated > capacity
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-all duration-400"
        style={{ width: `${pct}%`, background: over ? T.red : T.emerald }} />
    </div>
  )
}

function RemoveConfirmModal({
  state,
  onConfirm,
  onCancel,
}: {
  state: RemoveModalState
  onConfirm: () => void
  onCancel: () => void
}) {
  const { pkg, stats, loading } = state
  const hasSold = (stats?.sold ?? 0) > 0
  const hasReserved = (stats?.reserved ?? 0) > 0
  const canDelete = !hasSold

  return (
    <div className="fixed inset-0 z-[600] grid place-items-center bg-black/80 p-4" onClick={onCancel}>
      <div
        role="dialog" aria-modal="true"
        className="w-full max-w-md rounded-3xl p-6 space-y-5"
        style={{ background: T.bg2, border: `1px solid rgba(239,68,68,.25)` }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: T.red }}>
            {hasSold ? 'Archive Package' : 'Remove Package'}
          </div>
          <h2 className="mt-2 font-serif text-xl font-bold" style={{ color: T.text }}>{pkg.name}</h2>
        </div>

        {loading ? (
          <div className="text-sm animate-pulse" style={{ color: T.textMuted }}>Loading seat statistics…</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Allocated', stats?.total ?? 0, T.text],
              ['Available', stats?.available ?? 0, T.emerald],
              ['Reserved', stats?.reserved ?? 0, T.purple],
              ['Sold', stats?.sold ?? 0, T.gold],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-xl p-3" style={{ background: T.bg3 }}>
                <div className="text-[10px] uppercase font-mono" style={{ color: T.textMuted }}>{label}</div>
                <div className="text-lg font-bold font-mono mt-0.5" style={{ color: color as string }}>{String(value)}</div>
              </div>
            ))}
          </div>
        )}

        {hasSold ? (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: T.gold }}>
            ⚠ This package has <strong>{stats?.sold} sold</strong> {(stats?.sold ?? 0) === 1 ? 'seat' : 'seats'}. It cannot be permanently deleted. Archiving will hide it from new customers while preserving existing bookings and tickets.
          </div>
        ) : hasReserved ? (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: T.purple }}>
            ℹ This package has <strong>{stats?.reserved} reserved</strong> {(stats?.reserved ?? 0) === 1 ? 'seat' : 'seats'}. Those reservations will be released when the package is removed.
          </div>
        ) : (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: T.textSub }}>
            Removing this package will release its seat allocation back to the event's unallocated capacity. This action persists to all devices and cannot be undone.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl px-4 py-2 text-xs"
            style={{ background: T.inputBg, color: T.text }}>Cancel</button>
          <button onClick={onConfirm}
            className="rounded-xl px-4 py-2 text-xs font-bold"
            style={{ background: hasSold ? T.gold : T.red, color: '#fff' }}>
            {hasSold ? 'Archive Package' : 'Remove Package'}
          </button>
        </div>

        {!canDelete && (
          <div className="text-[10px] font-mono" style={{ color: T.textMuted }}>
            Destructive deletion is disabled when sold seats exist. Use Archive to hide from customers.
          </div>
        )}
      </div>
    </div>
  )
}

export function PackageAllocationEditor({
  eventId,
  packages,
  capacity,
  onChange,
  onSave,
  saving = false,
}: {
  eventId: string
  packages: TicketPackage[]
  capacity: number
  onChange: (packages: TicketPackage[]) => void
  onSave: (packages: TicketPackage[]) => Promise<void>
  saving?: boolean
}) {
  const [removeModal, setRemoveModal] = useState<RemoveModalState | null>(null)
  const [allocationSaving, setAllocationSaving] = useState<Record<string, boolean>>({})
  const [allocationError, setAllocationError] = useState<Record<string, string>>({})
  const [seatStatsMap, setSeatStatsMap] = useState<Record<string, PackageSeatStats>>({})
  const [addingNew, setAddingNew] = useState(false)

  // Active (non-removed) packages
  const activePackages = packages.filter(p => p.enabled !== false && !p.deletedAt)

  const totalAllocated = activePackages.reduce((sum, p) => sum + (p.capacity ?? 0), 0)
  const remaining = capacity - totalAllocated
  const overCapacity = totalAllocated > capacity && capacity > 0

  const loadSeatStats = useCallback(async (pkgId: string) => {
    try {
      const stats = await packageService.getSeatStats(pkgId)
      setSeatStatsMap(prev => ({ ...prev, [pkgId]: stats }))
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    activePackages.forEach(pkg => { void loadSeatStats(pkg.id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.length])

  // Realtime subscription on packages
  useEffect(() => {
    if (!eventId) return
    try {
      const sb = requireSupabase()
      const channel = sb.channel(`pkg-editor-${eventId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'seats', filter: `event_id=eq.${eventId}` }, () => {
          activePackages.forEach(p => { void loadSeatStats(p.id) })
        })
        .subscribe()
      return () => { void sb.removeChannel(channel) }
    } catch { return undefined }
  }, [eventId, loadSeatStats])

  const updatePackage = (id: string, fields: Partial<TicketPackage>) => {
    onChange(packages.map(p => p.id === id ? { ...p, ...fields } : p))
  }

  const addPackage = () => {
    const newPkg: TicketPackage = {
      id: crypto.randomUUID(),
      name: 'New Package',
      price: 0,
      description: '',
      benefits: [],
      capacity: 0,
      color: '#71717A',
      displayOrder: activePackages.length,
      seatSelectionEnabled: true,
      enabled: true,
    }
    onChange([...packages, newPkg])
    setAddingNew(false)
  }

  const openRemoveModal = async (pkg: TicketPackage) => {
    setRemoveModal({ pkg, stats: null, loading: true })
    try {
      const stats = await packageService.getSeatStats(pkg.id)
      setRemoveModal(prev => prev ? { ...prev, stats, loading: false } : null)
    } catch {
      setRemoveModal(prev => prev ? { ...prev, stats: { total: 0, available: 0, reserved: 0, sold: 0, disabled: 0 }, loading: false } : null)
    }
  }

  const confirmRemove = async () => {
    if (!removeModal) return
    const pkg = removeModal.pkg
    const hasSold = (removeModal.stats?.sold ?? 0) > 0

    try {
      if (hasSold) {
        // Archive: disable in DB via service, mark in local state
        await packageService.remove(pkg.id) // RPC handles archive vs delete
        onChange(packages.map(p => p.id === pkg.id ? { ...p, enabled: false } : p))
      } else {
        // Safe removal: call RPC, remove from local state
        await packageService.remove(pkg.id)
        onChange(packages.filter(p => p.id !== pkg.id))
      }
      setRemoveModal(null)
    } catch (err) {
      setRemoveModal(prev => prev ? { ...prev, loading: false } : null)
      console.error('Failed to remove package:', err)
    }
  }

  const saveAllocation = async (pkg: TicketPackage) => {
    const newCount = pkg.capacity ?? 0
    const stats = seatStatsMap[pkg.id]
    const protectedSeats = (stats?.sold ?? 0) + (stats?.reserved ?? 0)

    if (newCount < protectedSeats) {
      setAllocationError(prev => ({ ...prev, [pkg.id]: `Cannot reduce below ${protectedSeats} protected seats (sold + reserved)` }))
      return
    }

    if (capacity > 0 && totalAllocated > capacity) {
      setAllocationError(prev => ({ ...prev, [pkg.id]: 'Total package allocations exceed event capacity' }))
      return
    }

    setAllocationSaving(prev => ({ ...prev, [pkg.id]: true }))
    setAllocationError(prev => ({ ...prev, [pkg.id]: '' }))

    try {
      // Upsert the package in Supabase
      await packageService.upsert({
        id: pkg.id,
        eventId,
        name: pkg.name,
        price: pkg.price,
        capacity: newCount,
        displayOrder: pkg.displayOrder ?? 0,
        seatSelectionEnabled: pkg.seatSelectionEnabled !== false,
        enabled: true,
        description: pkg.description,
        benefits: pkg.benefits,
        color: pkg.color,
      })

      // Adjust seat allocation in Supabase
      await seatService.adjustAllocation(pkg.id, newCount, seatPrefix(pkg.name))
      void loadSeatStats(pkg.id)

      // Notify parent so changes propagate to bookingPage.packages (published page)
      const updatedPkg = { ...pkg, capacity: newCount }
      onChange(packages.map(p => p.id === pkg.id ? updatedPkg : p))
    } catch (err) {
      setAllocationError(prev => ({ ...prev, [pkg.id]: err instanceof Error ? err.message : 'Failed to save allocation' }))
    } finally {
      setAllocationSaving(prev => ({ ...prev, [pkg.id]: false }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Allocation status header */}
      {capacity > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{
            background: overCapacity ? 'rgba(239,68,68,0.08)' : remaining === 0 ? 'rgba(0,255,136,0.06)' : 'rgba(245,158,11,0.06)',
            border: `1px solid ${overCapacity ? 'rgba(239,68,68,0.25)' : remaining === 0 ? 'rgba(0,255,136,0.2)' : 'rgba(245,158,11,0.18)'}`,
          }}
        >
          <span className="text-sm font-semibold"
            style={{ color: overCapacity ? T.red : remaining === 0 ? T.emerald : T.gold }}>
            {overCapacity
              ? `⚠ Package allocations exceed capacity by ${totalAllocated - capacity} seats`
              : remaining === 0
                ? `✓ All ${capacity} seats allocated`
                : `${remaining} seat${remaining !== 1 ? 's' : ''} remaining to allocate`}
          </span>
          <span className="text-xs font-mono" style={{ color: T.textMuted }}>{totalAllocated} / {capacity}</span>
        </div>
      )}

      {/* Per-package editors */}
      {activePackages.map((pkg, idx) => {
        const stats = seatStatsMap[pkg.id]
        const pkgSaving = allocationSaving[pkg.id]
        const pkgError = allocationError[pkg.id]
        const seatsGenerated = (stats?.total ?? 0) > 0

        return (
          <div key={pkg.id} className="rounded-2xl overflow-hidden"
            style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
            {/* Package header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: pkg.color ?? T.textMuted }} />
                <input
                  value={pkg.name}
                  onChange={e => updatePackage(pkg.id, { name: e.target.value })}
                  className="text-sm font-bold bg-transparent outline-none border-b border-transparent focus:border-white/20"
                  style={{ color: T.text, minWidth: 80 }}
                  placeholder="Package name"
                />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', color: T.textMuted }}>
                  #{idx + 1}
                </span>
              </div>
              <button
                onClick={() => openRemoveModal(pkg)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', color: T.red, border: '1px solid rgba(239,68,68,0.2)' }}
              >
                Remove
              </button>
            </div>

            {/* Fields */}
            <div className="px-5 pb-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Price */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.textMuted }}>$</span>
                    <input type="number" min={0} step="0.01"
                      value={pkg.price}
                      onChange={e => updatePackage(pkg.id, { price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-6 pr-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }} />
                  </div>
                </div>
                {/* Display order */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>Display Order</label>
                  <input type="number" min={0}
                    value={pkg.displayOrder ?? idx}
                    onChange={e => updatePackage(pkg.id, { displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>Description</label>
                <input
                  value={pkg.description}
                  onChange={e => updatePackage(pkg.id, { description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                  placeholder="Short description shown on booking page" />
              </div>

              {/* Seat allocation */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>
                  Seat Allocation
                  {stats && <span className="ml-2 normal-case" style={{ color: T.textMuted }}>
                    ({stats.available} avail · {stats.sold} sold · {stats.reserved} reserved)
                  </span>}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={capacity}
                    value={pkg.capacity}
                    onChange={e => updatePackage(pkg.id, { capacity: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-32 px-3 py-2 rounded-xl text-sm outline-none font-mono"
                    style={{ background: T.inputBg, border: `1px solid ${pkgError ? T.red : T.border}`, color: T.text }} />
                  <button
                    disabled={pkgSaving}
                    onClick={() => saveAllocation(pkg)}
                    className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                    style={{ background: 'rgba(0,255,136,0.12)', color: T.emerald, border: '1px solid rgba(0,255,136,0.25)' }}>
                    {pkgSaving ? 'Saving…' : seatsGenerated ? 'Update Seats' : 'Generate Seats'}
                  </button>
                </div>
                {pkgError && <div className="text-xs mt-1" style={{ color: T.red }}>{pkgError}</div>}
                <AllocationBar allocated={pkg.capacity} capacity={capacity} />
              </div>

              {/* Seat selection toggle */}
              <div className="flex items-center justify-between py-2 border-t" style={{ borderColor: T.border }}>
                <div>
                  <div className="text-xs font-semibold" style={{ color: T.text }}>Seat Selection</div>
                  <div className="text-[10px]" style={{ color: T.textMuted }}>Allow customers to choose their seat</div>
                </div>
                <button
                  onClick={() => updatePackage(pkg.id, { seatSelectionEnabled: !pkg.seatSelectionEnabled })}
                  className="relative w-10 h-5 rounded-full transition-all duration-200"
                  style={{
                    background: pkg.seatSelectionEnabled !== false ? T.emerald : T.inputBg,
                    border: `1px solid ${pkg.seatSelectionEnabled !== false ? T.emerald : T.border}`,
                  }}>
                  <span className="absolute top-0.5 transition-all duration-200 w-4 h-4 rounded-full"
                    style={{ background: '#fff', left: pkg.seatSelectionEnabled !== false ? 22 : 2 }} />
                </button>
              </div>

              {/* Visual seat manager (reveals after seats are generated) */}
              {seatsGenerated && (
                <VisualSeatManager
                  eventId={eventId}
                  packageId={pkg.id}
                  packageName={pkg.name}
                  totalAllocated={pkg.capacity}
                  onStatsChange={(available, total) => {
                    setSeatStatsMap(prev => ({
                      ...prev,
                      [pkg.id]: { ...prev[pkg.id], total, available },
                    }))
                  }}
                />
              )}
            </div>
          </div>
        )
      })}

      {/* Add package */}
      <button
        onClick={addPackage}
        className="w-full py-3 rounded-2xl text-sm font-semibold border-dashed"
        style={{ background: 'transparent', border: `2px dashed ${T.border}`, color: T.textSub }}>
        + Add Package
      </button>

      {/* Global save */}
      <button
        disabled={saving || overCapacity}
        onClick={() => onSave(activePackages)}
        className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
        {saving ? 'Saving…' : overCapacity ? 'Fix Allocation to Save' : 'Save Packages'}
      </button>

      {removeModal && (
        <RemoveConfirmModal
          state={removeModal}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveModal(null)}
        />
      )}
    </div>
  )
}

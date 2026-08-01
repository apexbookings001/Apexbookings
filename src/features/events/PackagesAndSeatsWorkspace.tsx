import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SeatStatus } from '../../types/domain'
import { adminEventStore, type ManagedEvent, type TicketPackage } from './adminEventStore'
import type { BookingPageData } from './bookingTemplate'
import { PACKAGE_TYPE_LIBRARY, type PackageTypeDefinition } from './packageTypeLibrary'
import { PackageTypeLibraryPicker } from './PackageTypeLibraryPicker'
import {
  bookingPageWithPackages,
  createPackageSeatsDraft,
  draftNumber,
  draftPrice,
  type PackageSeatsDraft,
  validatePackageSeatsDraft,
} from './packageSeatsDraft'
import { seatPrefix, seatService, type SeatRecord } from './seatService'
import { seatLabelForPackage } from './seatLabels'

const T = {
  card: '#18181B',
  border: 'rgba(255,255,255,0.10)',
  muted: '#A1A1AA',
  emerald: '#00FF88',
  red: '#F87171',
  amber: '#FCD34D',
}

type SavedEvent = {
  event: ManagedEvent
  seats: SeatRecord[]
}

export type PackageSeatPreview = {
  page: BookingPageData
  seats: SeatRecord[]
}

export type PackageSeatsDirtyState = {
  packageConfigurationDirty: boolean
  seatAvailabilityDirty: boolean
  isSaving: boolean
}

function activePackages(event: ManagedEvent): TicketPackage[] {
  return (event.packages ?? []).filter(item => item.enabled !== false && !item.deletedAt)
}

function packageFromType(type: PackageTypeDefinition, displayOrder: number): TicketPackage {
  return {
    id: crypto.randomUUID(),
    name: type.name,
    price: 0,
    originalPrice: 0,
    discountedPrice: null,
    discountEnabled: false,
    discountEndsAt: null,
    description: type.description,
    benefits: [...type.benefits],
    color: type.accent,
    accent: type.accent,
    glow: type.glow,
    icon: type.icon,
    category: type.category,
    badge: type.badge,
    sections: [...type.sections],
    capacity: 0,
    displayOrder,
    seatSelectionEnabled: true,
    enabled: true,
  }
}

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function countStatuses(seats: SeatRecord[], statusBySeatId: Record<string, SeatStatus>) {
  return seats.reduce<Record<SeatStatus, number>>((counts, seat) => {
    const status = statusBySeatId[seat.id] ?? seat.status
    counts[status] += 1
    return counts
  }, { available: 0, disabled: 0, reserved: 0, sold: 0 })
}

function packagesFromDraft(draft: PackageSeatsDraft): TicketPackage[] {
  return draft.packages.map((pkg, displayOrder) => {
    const price = draftPrice(draft.priceTextByPackageId[pkg.id] ?? String(pkg.originalPrice ?? pkg.price ?? 0))
    return {
      ...pkg,
      price,
      originalPrice: price,
      capacity: draftNumber(draft.allocationTextByPackageId[pkg.id] ?? String(pkg.capacity ?? 0)),
      displayOrder,
      seatSelectionEnabled: pkg.seatSelectionEnabled !== false,
    }
  })
}

/** A preview-only seat projection. New seats get temporary IDs and are never
 * sent to checkout; committed pages continue to load only Supabase records. */
function previewSeatsFromDraft(draft: PackageSeatsDraft, committedSeats: SeatRecord[]): SeatRecord[] {
  return packagesFromDraft(draft).flatMap(pkg => {
    const allocation = pkg.capacity
    const existing = committedSeats
      .filter(seat => seat.packageId === pkg.id)
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, allocation)
    return Array.from({ length: allocation }, (_, index) => {
      const seat = existing[index]
      if (seat) return { ...seat, status: draft.seatStatusBySeatId[seat.id] ?? seat.status }
      return {
        id: `draft:${pkg.id}:${index + 1}`,
        eventId: draft.eventId,
        packageId: pkg.id,
        label: seatLabelForPackage(pkg.name, index + 1),
        status: 'available' as SeatStatus,
      }
    })
  })
}

export function PackagesAndSeatsWorkspace({
  eventId,
  fallbackPage,
  onSaved,
  onDraftChange,
  onDirtyStateChange,
  onSaveSuccess,
  onClose,
}: {
  eventId?: string
  fallbackPage: BookingPageData
  onSaved: (preview: PackageSeatPreview) => void
  onDraftChange?: (preview: PackageSeatPreview) => void
  onDirtyStateChange?: (state: PackageSeatsDirtyState) => void
  onSaveSuccess?: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PackageSeatsDraft | null>(null)
  const [saved, setSaved] = useState<SavedEvent | null>(null)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [seatPackageId, setSeatPackageId] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(eventId))
  const [saving, setSaving] = useState(false)
  const [savingAvailabilityFor, setSavingAvailabilityFor] = useState<string | null>(null)
  const [draftTouched, setDraftTouched] = useState(false)
  const [packageConfigurationDirty, setPackageConfigurationDirty] = useState(false)
  const [seatEditorRevisionByPackage, setSeatEditorRevisionByPackage] = useState<Record<string, number>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fallbackPageRef = useRef(fallbackPage)

  useEffect(() => { fallbackPageRef.current = fallbackPage }, [fallbackPage])

  const readCommitted = useCallback(async (): Promise<SavedEvent | null> => {
    if (!eventId) return null
    const events = await adminEventStore.hydrate()
    const event = events.find(item => item.id === eventId)
    if (!event) throw new Error('This event no longer exists.')
    const packages = activePackages(event)
    const groups = await Promise.all(packages.map(async pkg => seatService.listAdmin(event.id, pkg.id)))
    return { event, seats: groups.flat() }
  }, [eventId])

  const loadSaved = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const next = await readCommitted()
      if (!next) return
      setSaved(next)
      setDraft(createPackageSeatsDraft(next.event, next.seats))
      setDraftTouched(false)
      setPackageConfigurationDirty(false)
      setSelectedPackageId(current => current && next.event.packages?.some(item => item.id === current) ? current : next.event.packages?.[0]?.id ?? null)
      setSeatPackageId(current => current && next.event.packages?.some(item => item.id === current) ? current : null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load saved package settings.')
    } finally {
      setLoading(false)
    }
  }, [eventId, readCommitted])

  // This is deliberately the only load effect. It is not tied to store,
  // realtime, recovery, or parent-page changes, so it cannot overwrite edits.
  useEffect(() => { void loadSaved() }, [loadSaved])

  useEffect(() => {
    if (!draftTouched || !draft || !saved) return
    const packages = packagesFromDraft(draft)
    onDraftChange?.({
      page: bookingPageWithPackages(fallbackPageRef.current, packages),
      seats: previewSeatsFromDraft(draft, saved.seats),
    })
  }, [draft, draftTouched, onDraftChange, saved])

  const updateDraft = (update: (current: PackageSeatsDraft) => PackageSeatsDraft, kind: 'package' | 'seat' = 'package') => {
    if (saving || savingAvailabilityFor !== null) return
    setDraft(current => current ? update(current) : current)
    setDraftTouched(true)
    if (kind === 'package') setPackageConfigurationDirty(true)
  }

  const updatePackage = (id: string, update: (pkg: TicketPackage) => TicketPackage) => {
    updateDraft(current => ({
      ...current,
      packages: current.packages.map(item => item.id === id ? update(item) : item),
    }))
  }

  const addType = (type: PackageTypeDefinition) => {
    updateDraft(current => {
      const pkg = packageFromType(type, current.packages.length)
      return {
        ...current,
        packages: [...current.packages, pkg],
        priceTextByPackageId: { ...current.priceTextByPackageId, [pkg.id]: '0' },
        allocationTextByPackageId: { ...current.allocationTextByPackageId, [pkg.id]: '0' },
      }
    })
    setMessage(`${type.name} was added with a price and allocation of 0.`)
  }

  const removePackage = (id: string) => {
    updateDraft(current => ({ ...current, packages: current.packages.filter(item => item.id !== id) }))
    setSelectedPackageId(current => current === id ? null : current)
    setSeatPackageId(current => current === id ? null : current)
  }

  const activeDraftPackages = draft?.packages ?? []
  const capacity = draft ? draftNumber(draft.capacityText) : 0
  const allocated = draft ? activeDraftPackages.reduce((sum, pkg) => sum + draftNumber(draft.allocationTextByPackageId[pkg.id] ?? String(pkg.capacity)), 0) : 0
  const seatsByPackage = useMemo(() => {
    const groups: Record<string, SeatRecord[]> = {}
    for (const seat of saved?.seats ?? []) if (seat.packageId) (groups[seat.packageId] ??= []).push(seat)
    return groups
  }, [saved?.seats])
  const selectedPackage = activeDraftPackages.find(item => item.id === selectedPackageId) ?? null
  const seatAvailabilityDirty = Boolean(draft && saved?.seats.some(seat => (
    (seat.status === 'available' || seat.status === 'disabled')
    && (draft.seatStatusBySeatId[seat.id] ?? seat.status) !== seat.status
  )))
  const pendingSeatPackageIds = saved?.seats.reduce<string[]>((ids, seat) => {
    const nextStatus = draft?.seatStatusBySeatId[seat.id] ?? seat.status
    if ((seat.status === 'available' || seat.status === 'disabled') && nextStatus !== seat.status && seat.packageId && !ids.includes(seat.packageId)) ids.push(seat.packageId)
    return ids
  }, []) ?? []
  const isSaving = saving || savingAvailabilityFor !== null

  useEffect(() => {
    onDirtyStateChange?.({ packageConfigurationDirty, seatAvailabilityDirty, isSaving })
  }, [isSaving, onDirtyStateChange, packageConfigurationDirty, seatAvailabilityDirty])

  const save = async () => {
    if (!draft || !eventId || isSaving) return
    if (seatAvailabilityDirty) {
      setError('Save or discard your seat availability changes before changing package allocations.')
      return
    }
    const checked = validatePackageSeatsDraft(draft)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    let saveSucceeded = false
    try {
      // Reload only at the explicit save boundary so unrelated fields are
      // preserved when this module writes its package projection.
      const latest = await readCommitted()
      if (!latest) throw new Error('This event no longer exists.')
      const bookingPage = bookingPageWithPackages(latest.event.bookingPage ?? fallbackPage, checked.value.packages)
      await adminEventStore.saveAsync({
        ...latest.event,
        capacity: checked.value.capacity,
        packages: checked.value.packages,
        bookingPage,
      })

      // Package records now exist. Allocation reconciliation is an explicit
      // save boundary; seat availability has its own explicit save action.
      await Promise.all(checked.value.packages.map(pkg =>
        seatService.adjustAllocation(pkg.id, pkg.capacity, seatPrefix(pkg.name))
      ))

      const committed = await readCommitted()
      if (!committed) throw new Error('The saved event could not be reloaded.')
      const committedPage = bookingPageWithPackages(committed.event.bookingPage ?? bookingPage, activePackages(committed.event))
      setSaved(committed)
      setDraft(createPackageSeatsDraft(committed.event, committed.seats))
      setDraftTouched(false)
      setPackageConfigurationDirty(false)
      onSaved({ page: committedPage, seats: committed.seats })
      setMessage('Packages, capacity, and generated seats have been saved.')
      saveSucceeded = true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save packages and seats.')
    } finally {
      setSaving(false)
    }
    if (saveSucceeded) onSaveSuccess?.()
  }

  const saveSeatAvailability = async (packageId: string) => {
    if (!draft || !eventId || isSaving) return
    const packageSeats = seatsByPackage[packageId] ?? []
    const changes = packageSeats.flatMap(seat => {
      const nextStatus = draft.seatStatusBySeatId[seat.id] ?? seat.status
      if ((seat.status !== 'available' && seat.status !== 'disabled') || nextStatus === seat.status) return []
      return [{ id: seat.id, status: nextStatus as 'available' | 'disabled' }]
    })
    if (!changes.length) {
      setMessage('There are no seat availability changes to save.')
      return
    }
    setSavingAvailabilityFor(packageId)
    setError(null)
    setMessage(null)
    try {
      await seatService.setAvailability(changes, eventId, packageId)
      const committed = await readCommitted()
      if (!committed) throw new Error('The saved seat availability could not be reloaded.')
      setSaved(committed)
      setDraft(current => current ? {
        ...current,
        // The committed rows are authoritative. Replacing rather than merging
        // drops stale pending status IDs from the local seat draft.
        seatStatusBySeatId: Object.fromEntries(committed.seats.map(seat => [seat.id, seat.status])),
      } : current)
      setSeatEditorRevisionByPackage(current => ({ ...current, [packageId]: (current[packageId] ?? 0) + 1 }))
      if (!packageConfigurationDirty) {
        setDraftTouched(false)
        const committedPage = bookingPageWithPackages(committed.event.bookingPage ?? fallbackPageRef.current, activePackages(committed.event))
        onSaved({ page: committedPage, seats: committed.seats })
      }
      setMessage('Seat availability has been saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save seat availability.')
    } finally {
      setSavingAvailabilityFor(null)
    }
  }

  const discardSeatChanges = (packageId?: string) => {
    if (!draft || !saved || isSaving) return
    const committedStatusBySeatId = Object.fromEntries(saved.seats
      .filter(seat => !packageId || seat.packageId === packageId)
      .map(seat => [seat.id, seat.status]))
    setDraft(current => current ? {
      ...current,
      seatStatusBySeatId: {
        ...current.seatStatusBySeatId,
        ...committedStatusBySeatId,
      },
    } : current)
    if (packageId) setSeatEditorRevisionByPackage(current => ({ ...current, [packageId]: (current[packageId] ?? 0) + 1 }))
    setError(null)
    setMessage('Seat availability changes were discarded.')
  }

  if (!eventId) {
    return <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">Packages &amp; Seats is configured on an event. Duplicate the template or open an event first.</div>
  }
  if (loading || !draft || !saved) return <div className="py-14 text-center text-sm text-zinc-400">Loading saved Packages &amp; Seats…</div>

  const remaining = capacity - allocated
  const statusTotals = countStatuses(saved.seats, draft.seatStatusBySeatId)

  return <div className="package-seat-workspace space-y-6">
    <div className="package-seat-draft flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4">
      <div><div className="text-sm font-bold text-white">One local draft</div><p className="mt-1 text-xs text-zinc-400">Typing here updates only the Event Studio preview draft. Packages and allocations save explicitly; seat availability saves separately and never autosaves.</p></div>
      <button type="button" disabled={isSaving} onClick={() => void loadSaved()} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">Reload saved data</button>
    </div>

    {error && <div role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
    {seatAvailabilityDirty && error === 'Save or discard your seat availability changes before changing package allocations.' && <div className="flex flex-wrap gap-2"><button type="button" disabled={isSaving} onClick={() => { const packageId = pendingSeatPackageIds[0] ?? null; setSelectedPackageId(packageId); setSeatPackageId(packageId) }} className="rounded-lg bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-40">Save Seat Availability</button><button type="button" disabled={isSaving} onClick={() => discardSeatChanges()} className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-40">Discard Seat Changes</button></div>}
    {message && <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}

    <div className="package-seat-content-grid grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section className="package-seat-visual-section space-y-4">
        <div><h3 className="text-lg font-bold text-white">Visual Package Cards</h3><p className="mt-1 text-xs text-zinc-400">Card presentation and package type library values stay in this same local draft. Library prices and allocations are intentionally reset to 0.</p></div>
        <div className="space-y-2">
          {activeDraftPackages.map((pkg, index) => {
            const isSelected = selectedPackageId === pkg.id
            const price = draftPrice(draft.priceTextByPackageId[pkg.id] ?? String(pkg.price))
            const allocation = draftNumber(draft.allocationTextByPackageId[pkg.id] ?? String(pkg.capacity))
            const stats = countStatuses(seatsByPackage[pkg.id] ?? [], draft.seatStatusBySeatId)
            return <button key={pkg.id} type="button" onClick={() => { setSelectedPackageId(pkg.id); setSeatPackageId(null) }} className="package-seat-visual-row w-full rounded-2xl border p-4 text-left" style={{ borderColor: isSelected ? `${pkg.accent ?? pkg.color ?? T.emerald}90` : T.border, background: isSelected ? 'rgba(255,255,255,.06)' : T.card }}>
              <span className="package-seat-row-availability mt-1 block text-xs text-emerald-300">{stats.available} available seats</span>
              <div className="flex gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl text-xl" style={{ background: `${pkg.accent ?? pkg.color ?? '#71717A'}22` }}>{pkg.icon ?? '🎫'}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-white">{pkg.name || `Package ${index + 1}`}</strong>{pkg.badge && <em className="rounded-full px-2 py-0.5 text-[10px] not-italic" style={{ background: `${pkg.accent ?? pkg.color ?? '#71717A'}22`, color: pkg.accent ?? pkg.color ?? T.muted }}>{pkg.badge}</em>}</span><span className="mt-1 block text-xs text-zinc-400">{allocation} seats · {formatPrice(price, saved.event.locale?.currencyCode ?? 'USD')}</span></span></div>
            </button>
          })}
        </div>
        <PackageTypeLibraryPicker action="add" onSelect={addType} />

        {selectedPackage && <div className="package-seat-visual-editor space-y-3 rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center justify-between"><div className="text-sm font-bold text-white">Edit visual card</div><button type="button" disabled={activeDraftPackages.length <= 1} onClick={() => removePackage(selectedPackage.id)} className="text-xs text-red-300 disabled:opacity-40">Remove package</button></div>
          <label className="block text-xs text-zinc-400">Package name<input value={selectedPackage.name} onChange={event => updatePackage(selectedPackage.id, pkg => ({ ...pkg, name: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label>
          <label className="block text-xs text-zinc-400">Description<textarea value={selectedPackage.description} onChange={event => updatePackage(selectedPackage.id, pkg => ({ ...pkg, description: event.target.value }))} className="mt-1.5 min-h-20 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label>
          <div className="grid grid-cols-[1fr_auto] gap-3"><label className="text-xs text-zinc-400">Icon<input value={selectedPackage.icon ?? ''} onChange={event => updatePackage(selectedPackage.id, pkg => ({ ...pkg, icon: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label><label className="text-xs text-zinc-400">Accent<input type="color" value={selectedPackage.accent ?? selectedPackage.color ?? '#71717A'} onChange={event => updatePackage(selectedPackage.id, pkg => ({ ...pkg, color: event.target.value, accent: event.target.value, glow: `${event.target.value}38` }))} className="mt-1.5 h-10 w-14 rounded-xl border border-white/10 bg-black/30 p-1" /></label></div>
          <label className="block text-xs text-zinc-400">Badge<input value={selectedPackage.badge ?? ''} onChange={event => updatePackage(selectedPackage.id, pkg => ({ ...pkg, badge: event.target.value.trim() || null }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label>
          <label className="block text-xs text-zinc-400">Benefits (one per line)<textarea value={(selectedPackage.benefits ?? []).join('\n')} onChange={event => updatePackage(selectedPackage.id, pkg => ({ ...pkg, benefits: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) }))} className="mt-1.5 min-h-20 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label>
        </div>}
      </section>

      <section className="package-seat-config-section space-y-4">
        <div><h3 className="text-lg font-bold text-white">Capacity, Pricing &amp; Seats</h3><p className="mt-1 text-xs text-zinc-400">Allocations must equal total venue capacity before a save can generate or reconcile seats.</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><label className="text-sm font-bold text-white">Total Venue Capacity<input inputMode="numeric" disabled={isSaving} value={draft.capacityText} onChange={event => updateDraft(current => ({ ...current, capacityText: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-50" /></label></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between text-xs"><span className="font-mono uppercase tracking-wider text-zinc-400">Capacity Summary</span><span className={remaining === 0 && capacity > 0 ? 'text-emerald-300' : remaining < 0 ? 'text-red-300' : 'text-amber-200'}>{allocated} / {capacity} allocated</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span className="rounded-lg bg-white/5 p-2 text-zinc-300">Available <b className="block text-base text-emerald-300">{statusTotals.available}</b></span><span className="rounded-lg bg-white/5 p-2 text-zinc-300">Unavailable <b className="block text-base text-red-300">{statusTotals.disabled}</b></span><span className="rounded-lg bg-white/5 p-2 text-zinc-300">Reserved <b className="block text-base text-violet-300">{statusTotals.reserved}</b></span><span className="rounded-lg bg-white/5 p-2 text-zinc-300">Sold <b className="block text-base text-amber-200">{statusTotals.sold}</b></span></div><p className="mt-3 text-xs text-zinc-400">{remaining === 0 && capacity > 0 ? 'All seats are allocated.' : remaining < 0 ? `${Math.abs(remaining)} seats over capacity.` : `${remaining} seats remaining to allocate.`}</p></div>

        <div className="package-seat-package-list space-y-3">
          {activeDraftPackages.map(pkg => {
            const packageSeats = seatsByPackage[pkg.id] ?? []
            const stats = countStatuses(packageSeats, draft.seatStatusBySeatId)
            const priceText = draft.priceTextByPackageId[pkg.id] ?? String(pkg.originalPrice ?? pkg.price)
            const allocationText = draft.allocationTextByPackageId[pkg.id] ?? String(pkg.capacity)
            const isSeatOpen = seatPackageId === pkg.id
            return <div key={pkg.id} data-expanded={selectedPackageId === pkg.id} className="package-seat-package-row rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-white">{pkg.name}</div><div className="mt-1 text-xs text-zinc-500">{packageSeats.length} allocated · {stats.available} available · {stats.disabled} unavailable · {stats.reserved + stats.sold} protected</div></div><button type="button" disabled={isSaving} onClick={() => { setSelectedPackageId(pkg.id); setSeatPackageId(isSeatOpen ? null : pkg.id) }} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 disabled:opacity-40">{isSeatOpen ? 'Hide seats' : 'Manage Seat Availability'}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Package price ({saved.event.locale?.currencyCode ?? 'USD'})<input inputMode="decimal" disabled={isSaving} value={priceText} onChange={event => updateDraft(current => ({ ...current, priceTextByPackageId: { ...current.priceTextByPackageId, [pkg.id]: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-50" /></label><label className="text-xs text-zinc-400">Seat allocation<input inputMode="numeric" disabled={isSaving} value={allocationText} onChange={event => updateDraft(current => ({ ...current, allocationTextByPackageId: { ...current.allocationTextByPackageId, [pkg.id]: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-50" /></label></div><label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/[.035] px-3 py-2.5 text-xs text-zinc-300"><span><b className="block text-sm text-white">Seat selection</b><span className="text-zinc-500">Allow customers to choose a seat in this package.</span></span><input type="checkbox" disabled={isSaving} checked={pkg.seatSelectionEnabled !== false} onChange={() => updatePackage(pkg.id, item => ({ ...item, seatSelectionEnabled: item.seatSelectionEnabled === false }))} /></label>{isSeatOpen && <SeatAvailabilityEditor key={`${pkg.id}:${seatEditorRevisionByPackage[pkg.id] ?? 0}`} seats={packageSeats} statuses={draft.seatStatusBySeatId} saving={savingAvailabilityFor === pkg.id} onApply={(seatIds, status) => updateDraft(current => ({ ...current, seatStatusBySeatId: { ...current.seatStatusBySeatId, ...Object.fromEntries(seatIds.map(seatId => [seatId, status])) } }), 'seat')} onSave={() => void saveSeatAvailability(pkg.id)} onDiscard={() => discardSeatChanges(pkg.id)} />}</div>
          })}
        </div>
      </section>
    </div>
    <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-[#111113]/95 py-4 backdrop-blur"><button type="button" disabled={isSaving} onClick={onClose} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Cancel</button><button type="button" disabled={isSaving} onClick={() => void save()} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50">{saving ? 'Saving Packages & Seats…' : 'Save Packages & Seats'}</button></div>
  </div>
}

function SeatAvailabilityEditor({
  seats,
  statuses,
  saving,
  onApply,
  onSave,
  onDiscard,
}: {
  seats: SeatRecord[]
  statuses: Record<string, SeatStatus>
  saving: boolean
  onApply: (seatIds: string[], status: 'available' | 'disabled') => void
  onSave: () => void
  onDiscard: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [targetStatus, setTargetStatus] = useState<'available' | 'disabled'>('disabled')
  if (!seats.length) return <p className="mt-3 rounded-xl bg-black/20 p-3 text-xs text-zinc-500">Seats will be generated after Save Packages &amp; Seats finishes for this allocation.</p>

  const isProtected = (seat: SeatRecord) => seat.status === 'reserved' || seat.status === 'sold'
  const editableSeats = seats.filter(seat => !isProtected(seat))
  const changedCount = editableSeats.filter(seat => (statuses[seat.id] ?? seat.status) !== seat.status).length
  const toggleSeat = (seat: SeatRecord) => {
    if (isProtected(seat)) return
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(seat.id)) next.delete(seat.id)
      else next.add(seat.id)
      return next
    })
  }
  const applyBulk = () => {
    const eligibleSelection = [...selectedIds].filter(id => editableSeats.some(seat => seat.id === id))
    if (!eligibleSelection.length) return
    onApply(eligibleSelection, targetStatus)
    setSelectedIds(new Set())
  }

  return <div className="package-seat-seat-manager mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><div className="text-sm font-semibold text-white">Seat Availability</div><p className="mt-1 text-xs text-zinc-400">Select generated seats, apply a local availability state, then save once. Reserved and sold seats stay locked.</p></div>
      <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{selectedIds.size} seat{selectedIds.size === 1 ? '' : 's'} selected</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setSelectedIds(new Set(editableSeats.map(seat => seat.id)))} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200">Select all</button>
      <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200">Clear selection</button>
      <select aria-label="Bulk seat availability action" value={targetStatus} onChange={event => setTargetStatus(event.target.value as 'available' | 'disabled')} className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-white">
        <option value="available">Mark Available</option>
        <option value="disabled">Mark Unavailable</option>
      </select>
      <button type="button" disabled={!selectedIds.size} onClick={applyBulk} className="rounded-lg bg-emerald-400/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-40">Apply to selected</button>
      {changedCount > 0 && <button type="button" disabled={saving} onClick={onDiscard} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 disabled:opacity-40">Discard Seat Changes</button>}
      <button type="button" disabled={!changedCount || saving} onClick={onSave} className="ml-auto rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-zinc-950 disabled:opacity-40">{saving ? 'Saving Seat Availability…' : 'Save Seat Availability'}</button>
    </div>
    <div className="package-seat-seat-grid mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto" role="listbox" aria-label="Generated package seats">
      {seats.map(seat => {
        const status = statuses[seat.id] ?? seat.status
        const protectedSeat = isProtected(seat)
        const selected = selectedIds.has(seat.id)
        const unavailable = status === 'disabled'
        return <button key={seat.id} type="button" aria-selected={selected} disabled={protectedSeat} title={protectedSeat ? 'This seat is protected by an active booking and cannot be changed here.' : `${seat.label}: ${unavailable ? 'Unavailable' : 'Available'}`} onClick={() => toggleSeat(seat)} className="relative min-h-12 min-w-14 rounded-lg px-2 text-[10px] font-mono font-bold disabled:cursor-not-allowed disabled:opacity-70" style={{ background: protectedSeat ? 'rgba(245,158,11,.12)' : selected ? 'rgba(96,165,250,.20)' : unavailable ? 'rgba(248,113,113,.12)' : 'rgba(0,255,136,.10)', border: `1px solid ${protectedSeat ? 'rgba(245,158,11,.35)' : selected ? 'rgba(96,165,250,.75)' : unavailable ? 'rgba(248,113,113,.35)' : 'rgba(0,255,136,.30)'}`, color: protectedSeat ? T.amber : selected ? '#93C5FD' : unavailable ? T.red : T.emerald }}><span className="block">{seat.label}</span><span className="mt-0.5 block text-[9px] normal-case">{protectedSeat ? 'Locked' : unavailable ? 'Unavailable' : 'Available'}</span></button>
      })}
    </div>
    {seats.some(isProtected) && <p className="mt-3 text-xs text-amber-200">Locked seats are protected by an active booking and cannot be changed here.</p>}
  </div>
}

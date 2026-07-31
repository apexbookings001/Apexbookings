import { useState, useEffect, useRef } from 'react'
import { type BookingPageData, type BookingPackage } from './bookingTemplate'
import { VisualPackageEditor } from './VisualPackageEditor'
import { PackageAllocationEditor } from './PackageAllocationEditor'
import { CapacitySummary } from './CapacitySummary'
import { adminEventStore, type ManagedEvent, type TicketPackage } from './adminEventStore'

/**
 * Merge edits from the allocation editor (TicketPackage[]) back into the
 * booking-page package cards (BookingPackage[]).
 *
 * Strategy:
 *  - Match by id where possible.
 *  - Overwrite name, price, seats (capacity), description and benefits so
 *    the published page always reflects the real allocation data.
 *  - Preserve visual-only fields (icon, accent, glow, badge, sections) that
 *    are set via the VisualPackageEditor.
 *  - Any TicketPackage that has no matching BookingPackage gets a new card
 *    appended with sensible defaults.
 */
function syncTicketPackagesToBookingPage(
  ticketPackages: TicketPackage[],
  currentBookingPackages: BookingPackage[],
): BookingPackage[] {
  const byId = new Map(currentBookingPackages.map(bp => [bp.id, bp]))

  const active = ticketPackages.filter(tp => tp.enabled !== false && !tp.deletedAt)

  return active.map(tp => {
    const existing = byId.get(tp.id)
    if (existing) {
      return {
        ...existing,
        name: tp.name,
        price: tp.price,
        seats: tp.capacity,
        desc: tp.description || existing.desc,
        benefits: tp.benefits?.length ? tp.benefits : existing.benefits,
      }
    }
    // New package — create a card with defaults
    return {
      id: tp.id,
      name: tp.name,
      price: tp.price,
      seats: tp.capacity,
      desc: tp.description || '',
      badge: null,
      accent: tp.color ?? '#71717A',
      glow: `${tp.color ?? '#71717A'}30`,
      icon: '🎫',
      sections: [],
      benefits: tp.benefits ?? [],
    } satisfies BookingPackage
  })
}

export function PackageAndSeatModal({
  data,
  eventId,
  onApply,
  onClose,
}: {
  data: BookingPageData
  eventId?: string
  onApply: (data: BookingPageData) => void
  onClose: () => void
}) {
  const [event, setEvent] = useState<ManagedEvent | undefined>(() =>
    eventId ? adminEventStore.list().find(e => e.id === eventId) : undefined
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Keep a ref to always have the latest event without stale closure issues
  const eventRef = useRef(event)
  useEffect(() => { eventRef.current = event }, [event])

  useEffect(() => {
    if (!eventId) return
    const unsub = adminEventStore.subscribe(() => {
      setEvent(adminEventStore.list().find(e => e.id === eventId))
    })
    return unsub
  }, [eventId])

  // Save capacity to the store (debounced via the input's own onChange)
  const handleCapacityChange = async (cap: number) => {
    const current = eventRef.current
    if (!current) return
    try {
      await adminEventStore.saveAsync({ ...current, capacity: cap })
    } catch { /* silent – UI shows stale value until next store refresh */ }
  }

  // Called by PackageAllocationEditor's "Save Packages" button
  const handleSavePackages = async (packages: TicketPackage[]) => {
    const current = eventRef.current
    if (!current) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      // 1. Merge ticket packages into bookingPage.packages so published page updates
      const syncedBookingPackages = syncTicketPackagesToBookingPage(
        packages,
        data.packages,
      )
      const updatedBookingPage: BookingPageData = { ...data, packages: syncedBookingPackages }

      // 2. Persist to store: update both event.packages AND event.bookingPage.packages
      await adminEventStore.saveAsync({
        ...current,
        packages,
        bookingPage: updatedBookingPage,
      })

      // 3. Propagate to the editor UI immediately (live preview update)
      onApply(updatedBookingPage)

      setSaveSuccess(true)
      window.setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save packages')
    } finally {
      setSaving(false)
    }
  }

  // Called on every field change in the allocation editor (live update, no spinner)
  const handlePackagesChange = (packages: TicketPackage[]) => {
    const current = eventRef.current
    if (!current) return

    // Sync names/prices/seats into bookingPage so editor preview stays fresh
    const syncedBookingPackages = syncTicketPackagesToBookingPage(
      packages,
      data.packages,
    )
    const updatedBookingPage: BookingPageData = { ...data, packages: syncedBookingPackages }

    void adminEventStore.saveAsync({
      ...current,
      packages,
      bookingPage: updatedBookingPage,
    })

    // Update the booking editor panel live preview
    onApply(updatedBookingPage)
  }

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/80 p-4">
      <section className="w-full max-w-5xl rounded-3xl border border-white/10 bg-[#111113] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-6 shrink-0">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Settings</p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-white">Packages &amp; Seats</h2>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && <span className="text-xs font-semibold text-emerald-400">✓ Saved</span>}
            {saveError && <span className="text-xs text-red-300">{saveError}</span>}
            <button onClick={onClose} className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 ios-stable-scroll">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left — Visual package cards */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Visual Package Cards</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Design the cards shown on your public landing page. Changes update the page preview live.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
                <VisualPackageEditor
                  packages={data.packages}
                  onChange={next => {
                    const updated = { ...data, packages: next }
                    onApply(updated)
                    // Also persist visual card changes to bookingPage so
                    // published page picks them up immediately
                    const current = eventRef.current
                    if (current) {
                      void adminEventStore.saveAsync({ ...current, bookingPage: updated })
                    }
                  }}
                />
              </div>
            </div>

            {/* Right — Capacity & seat allocation */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Capacity &amp; Seat Allocation</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Set the venue capacity and allocate seats to packages. Controls when packages show as sold out.
                </p>
              </div>

              {!eventId || !event ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Seat allocation can only be managed for real events.<br /><br />
                  You are editing the visual template. Duplicate it to create a real event, then configure capacity here.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Capacity input */}
                  <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                    <label className="block text-sm font-bold text-white">Total Venue Capacity</label>
                    <p className="mt-1 mb-3 text-xs text-zinc-400">
                      The absolute maximum tickets that can be sold across all packages.
                    </p>
                    <input
                      type="number"
                      min="0"
                      defaultValue={event.capacity}
                      onBlur={e => void handleCapacityChange(Math.max(0, parseInt(e.target.value) || 0))}
                      onChange={e => {
                        // Update local state immediately for responsive UI
                        const cap = Math.max(0, parseInt(e.target.value) || 0)
                        setEvent(prev => prev ? { ...prev, capacity: cap } : prev)
                      }}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>

                  <CapacitySummary eventId={event.id} capacity={event.capacity} />

                  <PackageAllocationEditor
                    eventId={event.id}
                    capacity={event.capacity}
                    packages={event.packages ?? []}
                    saving={saving}
                    onChange={handlePackagesChange}
                    onSave={handleSavePackages}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

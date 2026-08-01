import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BookingPageData } from './bookingTemplate'
import { PackagesAndSeatsWorkspace, type PackageSeatPreview, type PackageSeatsDirtyState } from './PackagesAndSeatsWorkspace'
import { useDocumentScrollLock } from '../../hooks/useDocumentScrollLock'

/**
 * Preserves the existing Packages & Seats entry point while isolating its
 * implementation from Event Studio's general editor state.
 */
export function PackageAndSeatModal({
  data,
  eventId,
  onApply,
  onDraftChange,
  onSaveSuccess,
  onDiscardChanges,
  onClose,
}: {
  data: BookingPageData
  eventId?: string
  onApply: (preview: PackageSeatPreview) => void
  onDraftChange: (preview: PackageSeatPreview) => void
  onSaveSuccess: () => void
  onDiscardChanges: () => void
  onClose: () => void
}) {
  useDocumentScrollLock(true)
  const [dirtyState, setDirtyState] = useState<PackageSeatsDirtyState>({ packageConfigurationDirty: false, seatAvailabilityDirty: false, isSaving: false })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const hasUnsavedChanges = dirtyState.packageConfigurationDirty || dirtyState.seatAvailabilityDirty
  const handleDirtyStateChange = useCallback((next: PackageSeatsDirtyState) => {
    setDirtyState(current => (
      current.packageConfigurationDirty === next.packageConfigurationDirty
      && current.seatAvailabilityDirty === next.seatAvailabilityDirty
      && current.isSaving === next.isSaving
    ) ? current : next)
  }, [])
  const requestClose = () => {
    if (dirtyState.isSaving) return
    if (hasUnsavedChanges) { setConfirmDiscard(true); return }
    onClose()
  }

  return createPortal(<div className="package-seat-modal fixed inset-0 z-[10000] grid place-items-center bg-black/80">
    <section className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111113] text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 p-6">
        <div><p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Settings</p><h2 className="mt-1 font-serif text-2xl font-bold">Packages &amp; Seats</h2></div>
        <button type="button" disabled={dirtyState.isSaving} onClick={requestClose} className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50">Close</button>
      </header>
      <div className="package-seat-modal-content flex-1 overflow-y-auto p-6 ios-stable-scroll">
        <PackagesAndSeatsWorkspace eventId={eventId} fallbackPage={data} onSaved={onApply} onDraftChange={onDraftChange} onDirtyStateChange={handleDirtyStateChange} onSaveSuccess={onSaveSuccess} onClose={requestClose} />
      </div>
    </section>
    {confirmDiscard && <div className="fixed inset-0 z-[10001] grid place-items-center bg-black/65 p-4"><section role="dialog" aria-modal="true" aria-labelledby="discard-package-seat-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#18181B] p-6 text-white shadow-2xl"><h3 id="discard-package-seat-title" className="font-serif text-xl font-bold">Discard unsaved changes?</h3><p className="mt-3 text-sm leading-6 text-zinc-300">You have unsaved package or seat changes. Close without saving?</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold">Continue Editing</button><button type="button" onClick={() => { onDiscardChanges(); onClose() }} className="rounded-xl bg-red-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Discard Changes</button></div></section></div>}
  </div>, document.body)
}

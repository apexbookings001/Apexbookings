import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { isEventAssetCategory, mediaLibraryStore, type LibraryAsset } from './mediaLibraryStore'

type MediaLibraryPickerProps = {
  open: boolean
  target: string | null
  accept: 'image' | 'visual'
  onClose: () => void
  onSelect: (asset: LibraryAsset) => void
}

function isSelectableAsset(asset: LibraryAsset, accept: MediaLibraryPickerProps['accept']) {
  if (!isEventAssetCategory(asset.category)) return false
  return accept === 'image' ? asset.mimeType.startsWith('image/') : asset.mimeType.startsWith('image/') || asset.mimeType.startsWith('video/')
}

export function MediaLibraryPicker({ open, target, accept, onClose, onSelect }: MediaLibraryPickerProps) {
  const snapshot = useSyncExternalStore(mediaLibraryStore.subscribe, mediaLibraryStore.snapshot, mediaLibraryStore.snapshot)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!open) return
    setSelectedId(null)
    setBrokenIds(new Set())
    if (import.meta.env.DEV) console.debug('[media-library] picker opened', { target })
    void mediaLibraryStore.hydrate().catch(() => undefined)
  }, [open, target])

  const assets = useMemo(
    () => snapshot.data.filter(asset => isSelectableAsset(asset, accept)),
    [accept, snapshot.data],
  )
  const selected = assets.find(asset => asset.id === selectedId && Boolean(asset.url))

  if (!open) return null

  return <div className="fixed inset-0 z-[11000] flex items-end bg-black/75 p-0 sm:grid sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Media library">
    <section className="flex max-h-[min(100dvh,50rem)] w-full flex-col rounded-t-3xl border border-white/10 bg-[#111113] text-white shadow-2xl sm:max-w-4xl sm:rounded-3xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 pb-3 pt-5 sm:px-6">
        <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-emerald-300">Media library</p><h2 className="mt-1 text-lg font-bold">Select from Library</h2><p className="mt-1 text-xs text-zinc-400">Choose media for {target ?? 'this section'}.</p></div>
        <button type="button" onClick={onClose} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200">Cancel</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch] sm:px-6">
        {snapshot.loading && <div className="grid min-h-44 place-items-center text-sm text-zinc-400">Loading media library…</div>}
        {!snapshot.loading && snapshot.error && <div className="grid min-h-44 place-items-center rounded-2xl border border-red-400/25 bg-red-400/10 p-6 text-center"><div><p className="text-sm font-semibold text-red-200">Unable to load the media library.</p><p className="mt-1 text-xs text-red-200/80">{snapshot.error}</p><button type="button" onClick={() => void mediaLibraryStore.hydrate().catch(() => undefined)} className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white">Retry</button></div></div>}
        {!snapshot.loading && !snapshot.error && assets.length === 0 && <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">No media has been uploaded yet.</div>}
        {!snapshot.loading && !snapshot.error && assets.length > 0 && <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map(asset => {
            const isVideo = asset.mimeType.startsWith('video/')
            const unavailable = !asset.url || brokenIds.has(asset.id)
            const selectedAsset = selectedId === asset.id
            return <button key={asset.id} type="button" disabled={unavailable} onClick={() => setSelectedId(asset.id)} className={`group min-w-0 overflow-hidden rounded-2xl border text-left transition ${selectedAsset ? 'border-emerald-300 ring-2 ring-emerald-400/50' : 'border-white/10 hover:border-white/35'} ${unavailable ? 'cursor-not-allowed opacity-60' : ''}`}>
              <div className="relative aspect-[4/3] bg-zinc-900">
                {unavailable ? <div className="grid h-full place-items-center px-3 text-center text-xs text-zinc-500">Preview unavailable</div> : isVideo ? <video src={asset.url} muted playsInline preload="metadata" onError={() => setBrokenIds(ids => new Set(ids).add(asset.id))} className="h-full w-full object-cover" /> : <img src={asset.url} alt="" loading="lazy" onError={() => setBrokenIds(ids => new Set(ids).add(asset.id))} className="h-full w-full object-cover" />}
                {selectedAsset && <span className="absolute right-2 top-2 rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-bold text-zinc-950">Selected</span>}
                {isVideo && !unavailable && <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-1 text-[9px] font-bold uppercase text-white">Video</span>}
              </div>
              <div className="min-w-0 p-2.5"><p className="truncate text-xs font-semibold text-white">{asset.name}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{asset.mimeType.split('/')[0] || 'file'}</p></div>
            </button>
          })}
        </div>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <p className="min-w-0 truncate text-xs text-zinc-500">{selected ? selected.name : 'Select an available media item.'}</p>
        <button type="button" disabled={!selected} onClick={() => { if (!selected) return; onSelect(selected); onClose() }} className="shrink-0 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">Use Selected Media</button>
      </footer>
    </section>
  </div>
}

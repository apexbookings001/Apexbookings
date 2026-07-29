import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHAT_ASSET_CATEGORIES,
  EVENT_ASSET_CATEGORIES,
  isChatAssetCategory,
  isEventAssetCategory,
  mediaLibraryStore,
  type ChatAssetCategory,
  type EventAssetCategory,
  type LibraryAsset,
  type MediaCategory,
} from './mediaLibraryStore'
import { useAdminRecoveryState } from '../recovery/AdminSessionRecoveryProvider'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const bytes = (value: number) =>
  value ? `${(value / 1024 / 1024).toFixed(1)} MB` : 'Remote asset'

type SortKey = 'newest' | 'name' | 'used'
type MediaGroup = 'event' | 'chat'

// ─── Asset grid card ──────────────────────────────────────────────────────────
function AssetCard({ asset, onClick }: { asset: LibraryAsset; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] text-left hover:border-white/20 transition-colors"
    >
      <div className="aspect-[4/3] bg-zinc-900">
        {asset.mimeType.startsWith('image/') ? (
          <img src={asset.url} className="h-full w-full object-cover" alt={asset.name} />
        ) : asset.mimeType.startsWith('video/') ? (
          <div className="grid h-full place-items-center text-2xl">🎬</div>
        ) : asset.mimeType.startsWith('audio/') ? (
          <div className="grid h-full place-items-center text-2xl">🎵</div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-zinc-500">
            {asset.mimeType.includes('pdf') ? '📄 PDF' : '📎 File'}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-xs font-semibold text-white">{asset.name}</p>
        <p className="mt-1 text-[10px] text-zinc-500">
          {asset.category} · {bytes(asset.size)}
        </p>
        {asset.from && (
          <span
            className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{
              background: asset.from === 'admin' ? 'rgba(0,255,136,0.12)' : 'rgba(139,92,246,0.12)',
              color: asset.from === 'admin' ? '#00FF88' : '#8B5CF6',
            }}
          >
            {asset.from === 'admin' ? 'Admin' : 'Customer'}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Asset detail modal ───────────────────────────────────────────────────────
function AssetModal({
  asset,
  onClose,
  onRename,
  onDelete,
  show,
}: {
  asset: LibraryAsset
  onClose: () => void
  onRename: (asset: LibraryAsset, name: string) => void
  onDelete: (asset: LibraryAsset) => void
  show: (msg: string) => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#111113]"
        onClick={e => e.stopPropagation()}
      >
        {asset.mimeType.startsWith('image/') && (
          <img
            src={asset.url}
            className="max-h-[50vh] w-full bg-black object-contain"
            alt={asset.name}
          />
        )}
        {asset.mimeType.startsWith('video/') && (
          <video src={asset.url} controls className="max-h-[50vh] w-full bg-black" />
        )}
        {asset.mimeType.startsWith('audio/') && (
          <div className="flex items-center justify-center bg-zinc-900 p-8">
            <audio src={asset.url} controls className="w-full" />
          </div>
        )}
        <div className="p-5">
          <div className="flex justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-bold text-white">{asset.name}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {asset.category} · {bytes(asset.size)} · {asset.mimeType}
              </p>
              {asset.conversationId && (
                <p className="mt-1 text-[10px] text-zinc-600">
                  Chat attachment · Conversation {asset.conversationId.slice(0, 8)}…
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white">
              ✕
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <span>
              Dimensions:{' '}
              {asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'}
            </span>
            <span>Used in: {asset.usageCount} place(s)</span>
            <span>Uploaded by: {asset.uploadedBy}</span>
            <span>Date: {new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(asset.url)
                show('Media URL copied')
              }}
              className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
            >
              Copy URL
            </button>
            <a
              href={asset.url}
              download={asset.name}
              className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
            >
              Download
            </a>
            {!asset.conversationId && (
              // Only allow rename for non-chat assets (chat assets are system-named)
              <button
                onClick={() => {
                  const name = window.prompt('Asset name', asset.name)
                  if (!name) return
                  onRename(asset, name)
                  show('Media renamed')
                }}
                className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
              >
                Rename
              </button>
            )}
            <button
              onClick={() => {
                onDelete(asset)
                show('Media deleted')
                onClose()
              }}
              className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared filter bar ────────────────────────────────────────────────────────
function FilterBar({
  query,
  setQuery,
  sort,
  setSort,
  view,
  setView,
}: {
  query: string
  setQuery: (v: string) => void
  sort: SortKey
  setSort: (v: SortKey) => void
  view: 'grid' | 'list'
  setView: (v: 'grid' | 'list') => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search file name, category, uploader…"
        className="min-w-56 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/50"
      />
      <select
        value={sort}
        onChange={e => setSort(e.target.value as SortKey)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200"
      >
        <option value="newest">Recently added</option>
        <option value="name">File name</option>
        <option value="used">Most used</option>
      </select>
      <button
        onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
        className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
      >
        {view === 'grid' ? 'List view' : 'Grid view'}
      </button>
    </div>
  )
}

// ─── Event Assets tab ─────────────────────────────────────────────────────────
function EventAssetsTab({
  onSelect,
  show,
  onUploadClick,
}: {
  onSelect: (asset: LibraryAsset) => void
  show: (msg: string) => void
  onUploadClick: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<EventAssetCategory | 'All'>('All')
  const [sort, setSort] = useState<SortKey>('newest')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const filtered = useMemo(() => {
    return mediaLibraryStore
      .listEventAssets()
      .filter(
        a =>
          (category === 'All' || a.category === category) &&
          `${a.name} ${a.category} ${a.uploadedBy}`.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'used'
            ? b.usageCount - a.usageCount
            : b.createdAt.localeCompare(a.createdAt),
      )
  }, [query, category, sort])

  return (
    <div className="space-y-4">
      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {(['All', ...EVENT_ASSET_CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat as EventAssetCategory | 'All')}
            className="rounded-lg px-3 py-1 text-xs transition-colors"
            style={{
              background: category === cat ? '#00FF88' : 'rgba(255,255,255,0.06)',
              color: category === cat ? '#09090B' : '#A1A1AA',
              fontWeight: category === cat ? 700 : 400,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <FilterBar
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        view={view}
        setView={setView}
      />

      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map(asset => (
            <AssetCard key={asset.id} asset={asset} onClick={() => onSelect(asset)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[.03] text-zinc-500">
              <tr>
                <th className="p-3">Asset</th>
                <th className="p-3">Category</th>
                <th className="p-3">Size</th>
                <th className="p-3">Uploaded</th>
                <th className="p-3">Usage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(asset => (
                <tr
                  key={asset.id}
                  onClick={() => onSelect(asset)}
                  className="cursor-pointer border-t border-white/10 text-zinc-200 hover:bg-white/[.02]"
                >
                  <td className="p-3 font-medium text-white">{asset.name}</td>
                  <td className="p-3">{asset.category}</td>
                  <td className="p-3">{bytes(asset.size)}</td>
                  <td className="p-3">{new Date(asset.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">{asset.usageCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!filtered.length && (
        <div className="rounded-2xl border border-white/10 p-12 text-center text-sm text-zinc-500">
          No event assets match these filters.
        </div>
      )}
    </div>
  )
}

// ─── Chat Attachments tab ─────────────────────────────────────────────────────
function ChatAttachmentsTab({ onSelect }: { onSelect: (asset: LibraryAsset) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ChatAssetCategory | 'All'>('All')
  const [sort, setSort] = useState<SortKey>('newest')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const filtered = useMemo(() => {
    return mediaLibraryStore
      .listChatAssets()
      .filter(
        a =>
          (category === 'All' || a.category === category) &&
          `${a.name} ${a.category} ${a.uploadedBy} ${a.conversationId ?? ''}`.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'used'
            ? b.usageCount - a.usageCount
            : b.createdAt.localeCompare(a.createdAt),
      )
  }, [query, category, sort])

  return (
    <div className="space-y-4">
      {/* Info notice */}
      <div
        className="flex items-start gap-3 rounded-2xl border p-4 text-sm"
        style={{ background: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.2)', color: '#A1A1AA' }}
      >
        <span className="text-lg">💬</span>
        <div>
          <span className="font-semibold" style={{ color: '#8B5CF6' }}>Chat Attachments</span>
          {' '}are files sent or received in support conversations. They are kept completely separate
          from event assets and are never mixed in the event editor or booking templates.
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {(['All', ...CHAT_ASSET_CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat as ChatAssetCategory | 'All')}
            className="rounded-lg px-3 py-1 text-xs transition-colors"
            style={{
              background: category === cat ? '#8B5CF6' : 'rgba(255,255,255,0.06)',
              color: category === cat ? '#fff' : '#A1A1AA',
              fontWeight: category === cat ? 700 : 400,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <FilterBar
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        view={view}
        setView={setView}
      />

      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map(asset => (
            <AssetCard key={asset.id} asset={asset} onClick={() => onSelect(asset)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[.03] text-zinc-500">
              <tr>
                <th className="p-3">File</th>
                <th className="p-3">Category</th>
                <th className="p-3">From</th>
                <th className="p-3">Size</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(asset => (
                <tr
                  key={asset.id}
                  onClick={() => onSelect(asset)}
                  className="cursor-pointer border-t border-white/10 text-zinc-200 hover:bg-white/[.02]"
                >
                  <td className="p-3 font-medium text-white">{asset.name}</td>
                  <td className="p-3">{asset.category}</td>
                  <td className="p-3 capitalize">{asset.from ?? '—'}</td>
                  <td className="p-3">{bytes(asset.size)}</td>
                  <td className="p-3">{new Date(asset.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!filtered.length && (
        <div className="rounded-2xl border border-white/10 p-12 text-center text-sm text-zinc-500">
          No chat attachments yet. Files sent in support conversations will appear here.
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function MediaLibraryPage({ show }: { show: (message: string) => void }) {
  const [group, setGroup] = useAdminRecoveryState<MediaGroup>('media.group', 'event', value => value === 'event' || value === 'chat')
  const [dragging, setDragging] = useState(false)
  const [selectedId, setSelectedId] = useAdminRecoveryState<string | null>('media.selectedAssetId', null, value => value === null || typeof value === 'string')
  const [, forceRefresh] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const refresh = () => forceRefresh(n => n + 1)
  const selected = mediaLibraryStore.list().find(asset => asset.id === selectedId) ?? null
  const storeStatus = mediaLibraryStore.snapshot()

  useEffect(() => mediaLibraryStore.subscribe(refresh), [])

  const uploadFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter(f => f.size > 0)
    if (!valid.length) return
    setUploading(true)
    try {
      const results = await Promise.allSettled(valid.map(file => mediaLibraryStore.upload(file, 'Other')))
      const uploaded = results.filter(result => result.status === 'fulfilled').length
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (uploaded) show(`${uploaded} asset${uploaded > 1 ? 's' : ''} uploaded and saved to Media Center`)
      if (failed.length) {
        const reason = failed[0].reason
        show(reason instanceof Error ? reason.message : `${failed.length} upload${failed.length > 1 ? 's' : ''} failed.`)
      }
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">
            Central library
          </p>
          <h1 className="font-serif text-2xl font-bold text-white">Media Center</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage event assets and chat attachments independently.
          </p>
        </div>
        {group === 'event' && (
          <button
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? 'Uploading media…' : 'Upload media'}
          </button>
        )}
        <input
          ref={fileInput}
          hidden
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,audio/*"
          onChange={e => void uploadFiles(e.target.files ?? [])}
        />
      </div>

      {storeStatus.error && (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-200">
          Media Center could not synchronize: {storeStatus.error}
        </div>
      )}

      {/* Group tabs */}
      <div
        className="flex rounded-2xl p-1"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {(
          [
            { id: 'event', label: '🎭 Event Assets', desc: 'Banners, photos, venue, gallery' },
            { id: 'chat', label: '💬 Chat Attachments', desc: 'Images, docs, voice notes from support' },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            onClick={() => setGroup(tab.id)}
            className="flex-1 rounded-xl py-3 px-4 text-left transition-all"
            style={{
              background: group === tab.id
                ? tab.id === 'event' ? 'rgba(0,255,136,0.1)' : 'rgba(139,92,246,0.1)'
                : 'transparent',
              border: group === tab.id
                ? `1px solid ${tab.id === 'event' ? 'rgba(0,255,136,0.25)' : 'rgba(139,92,246,0.25)'}`
                : '1px solid transparent',
            }}
          >
            <div
              className="text-sm font-semibold"
              style={{
                color: group === tab.id
                  ? tab.id === 'event' ? '#00FF88' : '#8B5CF6'
                  : '#A1A1AA',
              }}
            >
              {tab.label}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* Drag & drop zone — event assets only */}
      {group === 'event' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files) }}
          className="rounded-2xl border border-dashed p-5 text-center text-sm transition-colors"
          style={{
            borderColor: dragging ? '#00FF88' : 'rgba(255,255,255,0.15)',
            background: dragging ? 'rgba(0,255,136,0.05)' : 'rgba(255,255,255,0.02)',
            color: dragging ? '#00FF88' : '#71717A',
          }}
        >
          Drop event media here to upload, or click <strong>Upload media</strong> above.
          Uploads are reusable across every event.
        </div>
      )}

      {/* Tab content */}
      {group === 'event' ? (
        <EventAssetsTab
          onSelect={asset => setSelectedId(asset.id)}
          show={show}
          onUploadClick={() => fileInput.current?.click()}
        />
      ) : (
        <ChatAttachmentsTab onSelect={asset => setSelectedId(asset.id)} />
      )}

      {/* Detail modal */}
      {selected && (
        <AssetModal
          asset={selected}
          onClose={() => setSelectedId(null)}
          onRename={(asset, name) => {
            mediaLibraryStore.update({ ...asset, name })
            refresh()
            setSelectedId(asset.id)
          }}
          onDelete={asset => {
            mediaLibraryStore.remove(asset.id)
            refresh()
            setSelectedId(null)
          }}
          show={show}
        />
      )}
    </div>
  )
}

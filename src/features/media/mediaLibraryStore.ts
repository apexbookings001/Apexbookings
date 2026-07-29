// ─── Category types ───────────────────────────────────────────────────────────
// Event Assets: tied to event pages, media editor, hero/gallery/venue content
// Chat Attachments: sent/received in support conversations — kept strictly separate
export type EventAssetCategory =
  | 'Event Banners'
  | 'Artist Photos'
  | 'Venue Images'
  | 'Gallery Images'
  | 'Sponsors'
  | 'Logos'
  | 'Payment Proofs'
  | 'Ticket Assets'
  | 'Other'

export type ChatAssetCategory =
  | 'Chat Images'
  | 'Chat Videos'
  | 'Voice Notes'
  | 'Chat Documents'
  | 'Customer Uploads'
  | 'Admin Uploads'

export type MediaCategory = EventAssetCategory | ChatAssetCategory

// Grouping helpers for the UI
export const EVENT_ASSET_CATEGORIES: EventAssetCategory[] = [
  'Event Banners',
  'Artist Photos',
  'Venue Images',
  'Gallery Images',
  'Sponsors',
  'Logos',
  'Payment Proofs',
  'Ticket Assets',
  'Other',
]

export const CHAT_ASSET_CATEGORIES: ChatAssetCategory[] = [
  'Chat Images',
  'Chat Videos',
  'Voice Notes',
  'Chat Documents',
  'Customer Uploads',
  'Admin Uploads',
]

export function isEventAssetCategory(cat: MediaCategory): cat is EventAssetCategory {
  return (EVENT_ASSET_CATEGORIES as string[]).includes(cat)
}

export function isChatAssetCategory(cat: MediaCategory): cat is ChatAssetCategory {
  return (CHAT_ASSET_CATEGORIES as string[]).includes(cat)
}

// ─── Asset type ───────────────────────────────────────────────────────────────
export type LibraryAsset = {
  id: string
  name: string
  url: string
  bucket: string
  path: string
  category: MediaCategory
  mimeType: string
  size: number
  width?: number
  height?: number
  createdAt: string
  uploadedBy: string
  usageCount: number
  eventIds: string[]
  conversationId?: string   // for chat attachments — which conversation they belong to
  from?: 'customer' | 'admin' // for chat attachments — sender role
}

import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { getWorkspaceMembership, requireOrganizationId } from '../../services/supabase/workspace'

// ─── Persistence ──────────────────────────────────────────────────────────────
const cache = createProtectedMemoryStore<LibraryAsset[]>(() => [])
const read = () => cache.get()

function bucketForCategory(category: MediaCategory) {
  if (isChatAssetCategory(category)) return 'chat-files'
  if (category === 'Payment Proofs') return 'payment-proofs'
  if (category === 'Ticket Assets') return 'ticket-assets'
  return 'event-images'
}

const mimeByExtension: Record<string, string> = {
  avif: 'image/avif', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp',
  m4v: 'video/x-m4v', mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', pdf: 'application/pdf',
}

function normalizedMimeType(file: File) {
  if (file.type) return file.type.toLowerCase()
  return mimeByExtension[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

async function storedAssetUrl(bucket: string, path: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (bucket === 'event-images') return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const signed = await supabase.storage.from(bucket).createSignedUrl(path, 24 * 60 * 60)
  if (signed.error) throw signed.error
  return signed.data.signedUrl
}

function imageDimensions(url: string): Promise<{ width?: number; height?: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({})
    img.src = url
  })
}

/** Derive the correct chat category from a MIME type */
function chatCategoryFromMime(mimeType: string, from: 'customer' | 'admin' = 'customer'): ChatAssetCategory {
  if (mimeType.startsWith('image/')) return 'Chat Images'
  if (mimeType.startsWith('video/')) return 'Chat Videos'
  if (mimeType.startsWith('audio/') || mimeType === 'audio/webm') return 'Voice Notes'
  if (from === 'customer') return 'Customer Uploads'
  return 'Admin Uploads'
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const mediaLibraryStore = {
  list: (): LibraryAsset[] => read(),
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,

  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const client = supabase
    try {
      const organizationId = requireOrganizationId()
      const { data, error } = await client.from('media').select('*').eq('organization_id', organizationId).is('deleted_at', null).eq('is_chat_media', false).order('created_at', { ascending: false })
      if (error) throw error
      const assets = await Promise.all((data ?? []).map(async row => {
        const metadata = (row.metadata ?? {}) as Partial<LibraryAsset>
        return {
          id: row.id,
          name: row.original_name ?? metadata.name ?? row.path.split('/').at(-1) ?? 'file',
          url: await storedAssetUrl(row.bucket, row.path),
          bucket: row.bucket,
          path: row.path,
          category: row.category ?? metadata.category ?? 'Other',
          mimeType: row.mime_type ?? 'application/octet-stream',
          size: Number(row.size_bytes ?? 0),
          width: row.width ?? metadata.width,
          height: row.height ?? metadata.height,
          createdAt: row.created_at,
          uploadedBy: metadata.uploadedBy ?? 'Admin',
          usageCount: Number(row.usage_count ?? metadata.usageCount ?? 0),
          eventIds: metadata.eventIds ?? [],
        } as LibraryAsset
      }))
      cache.set(assets)
      return assets
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },

  /** List only event assets (excludes all chat attachment categories) */
  listEventAssets: (): LibraryAsset[] =>
    read().filter(a => isEventAssetCategory(a.category)),

  /** List only chat attachments (excludes all event asset categories) */
  listChatAssets: (): LibraryAsset[] =>
    read().filter(a => isChatAssetCategory(a.category)),

  /**
   * Upload a file as an Event Asset.
   * Pass category explicitly — defaults to 'Other'.
   */
  async upload(
    file: File,
    category: MediaCategory = 'Other',
    uploadedBy = 'Admin',
  ): Promise<LibraryAsset> {
    const mimeType = normalizedMimeType(file)
    const allowed = ['image/', 'video/', 'application/pdf', 'audio/']
    if (!allowed.some(prefix => mimeType.startsWith(prefix))) {
      throw new Error('Only images, videos, audio, and PDFs can be uploaded.')
    }
    const maximumBytes = mimeType.startsWith('video/') ? 50 * 1024 * 1024 : 20 * 1024 * 1024
    if (file.size > maximumBytes) {
      throw new Error(`${mimeType.startsWith('video/') ? 'Videos must be 50 MB' : 'Files must be 20 MB'} or smaller.`)
    }

    if (!supabase) throw new Error('Supabase is not configured.')
    const organizationId = requireOrganizationId()
    const localUrl = URL.createObjectURL(file)
    const dimensions = mimeType.startsWith('image/') ? await imageDimensions(localUrl) : {}
    URL.revokeObjectURL(localUrl)
    const bucket = bucketForCategory(category)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
    const path = `${organizationId}/${crypto.randomUUID()}-${safeName}`
    const upload = await supabase.storage.from(bucket).upload(path, file, { contentType: mimeType, upsert: false })
    if (upload.error) throw upload.error
    let url: string
    try {
      url = await storedAssetUrl(bucket, path)
    } catch (error) {
      await supabase.storage.from(bucket).remove([path])
      throw error
    }

    const asset: LibraryAsset = {
      id: crypto.randomUUID(),
      name: file.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-'),
      url,
      bucket,
      path,
      category,
      mimeType,
      size: file.size,
      createdAt: new Date().toISOString(),
      uploadedBy,
      usageCount: 0,
      eventIds: [],
      ...dimensions,
    }

    const insert = await supabase.from('media').insert({
      id: asset.id,
      organization_id: organizationId,
      bucket,
      path,
      mime_type: asset.mimeType,
      size_bytes: asset.size,
      category: asset.category,
      original_name: asset.name,
      width: asset.width,
      height: asset.height,
      usage_count: 0,
      is_chat_media: isChatAssetCategory(category),
      metadata: { name: asset.name, category: asset.category, width: asset.width, height: asset.height, uploadedBy: asset.uploadedBy, usageCount: 0, eventIds: [] },
    })
    if (insert.error) {
      await supabase.storage.from(bucket).remove([path])
      throw insert.error
    }
    cache.set([asset, ...read()])
    return asset
  },

  /**
   * Register a chat attachment in the media library.
   * The URL is typically a local blob: URL or a remote URL already resolved.
   * Category is derived automatically from the MIME type and sender role.
   */
  registerChatAttachment(options: {
    name: string
    url: string
    mimeType: string
    size: number
    conversationId: string
    from: 'customer' | 'admin'
    width?: number
    height?: number
    duration?: number
  }): LibraryAsset {
    const category = chatCategoryFromMime(options.mimeType, options.from)
    const asset: LibraryAsset = {
      id: crypto.randomUUID(),
      name: options.name,
      url: options.url,
      bucket: 'chat-files',
      path: '',
      category,
      mimeType: options.mimeType,
      size: options.size,
      createdAt: new Date().toISOString(),
      uploadedBy: options.from === 'admin' ? 'Admin' : 'Customer',
      usageCount: 0,
      eventIds: [],
      conversationId: options.conversationId,
      from: options.from,
      width: options.width,
      height: options.height,
    }
    cache.set([asset, ...read()])
    return asset
  },

  update: (asset: LibraryAsset) => {
    const next = read().map(item => item.id === asset.id ? asset : item)
    void cache.optimistic(next, async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('media').update({
        original_name: asset.name,
        category: asset.category,
        width: asset.width,
        height: asset.height,
        usage_count: asset.usageCount,
        metadata: { name: asset.name, category: asset.category, width: asset.width, height: asset.height, uploadedBy: asset.uploadedBy, usageCount: asset.usageCount, eventIds: asset.eventIds },
      }).eq('id', asset.id).eq('organization_id', requireOrganizationId())
      if (error) throw error
    }).catch(() => undefined)
  },

  remove: (assetId: string) => {
    const asset = read().find(item => item.id === assetId)
    if (!asset) return
    void cache.optimistic(read().filter(item => item.id !== assetId), async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.from('media').update({ deleted_at: new Date().toISOString() }).eq('id', assetId).eq('organization_id', requireOrganizationId()).select('bucket,path').single()
      if (error) throw error
      await supabase.storage.from(data.bucket).remove([data.path])
    }).catch(() => undefined)
  },

  use: (assetId: string, eventId?: string) => {
    const asset = read().find(item => item.id === assetId)
    if (!asset) return
    mediaLibraryStore.update({
      ...asset,
      usageCount: asset.usageCount + 1,
      eventIds:
        eventId && !asset.eventIds.includes(eventId)
          ? [...asset.eventIds, eventId]
          : asset.eventIds,
    })
  },
  clear: cache.reset,
}

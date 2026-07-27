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

// ─── Persistence ──────────────────────────────────────────────────────────────
const KEY = 'apex.media-library'

const SEEDED: LibraryAsset[] = [
  {
    id: 'seed-stage',
    name: 'concert-stage.jpg',
    url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=900&fit=crop&auto=format',
    category: 'Event Banners',
    mimeType: 'image/jpeg',
    size: 0,
    createdAt: new Date().toISOString(),
    uploadedBy: 'Apex',
    usageCount: 0,
    eventIds: [],
  },
  {
    id: 'seed-crowd',
    name: 'concert-crowd.jpg',
    url: 'https://images.unsplash.com/photo-1546707012-c46675f12716?w=1600&h=900&fit=crop&auto=format',
    category: 'Gallery Images',
    mimeType: 'image/jpeg',
    size: 0,
    createdAt: new Date().toISOString(),
    uploadedBy: 'Apex',
    usageCount: 0,
    eventIds: [],
  },
  {
    id: 'seed-artist',
    name: 'artist-performance.jpg',
    url: 'https://images.unsplash.com/photo-1501962679900-bea61483313b?w=900&h=600&fit=crop&auto=format',
    category: 'Artist Photos',
    mimeType: 'image/jpeg',
    size: 0,
    createdAt: new Date().toISOString(),
    uploadedBy: 'Apex',
    usageCount: 0,
    eventIds: [],
  },
]

function read(): LibraryAsset[] {
  try {
    const saved = localStorage.getItem(KEY)
    return saved ? (JSON.parse(saved) as LibraryAsset[]) : SEEDED
  } catch {
    return SEEDED
  }
}

function write(assets: LibraryAsset[]) {
  localStorage.setItem(KEY, JSON.stringify(assets))
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
    const allowed = ['image/', 'video/', 'application/pdf', 'audio/']
    if (!allowed.some(prefix => file.type.startsWith(prefix))) {
      throw new Error('Only images, videos, audio, and PDFs can be uploaded.')
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('Files must be 20 MB or smaller.')
    }

    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    const dimensions = file.type.startsWith('image/') ? await imageDimensions(url) : {}

    const asset: LibraryAsset = {
      id: crypto.randomUUID(),
      name: file.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-'),
      url,
      category,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: new Date().toISOString(),
      uploadedBy,
      usageCount: 0,
      eventIds: [],
      ...dimensions,
    }

    write([asset, ...read()])
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
    write([asset, ...read()])
    return asset
  },

  update: (asset: LibraryAsset) =>
    write(read().map(item => (item.id === asset.id ? asset : item))),

  remove: (assetId: string) =>
    write(read().filter(asset => asset.id !== assetId)),

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
}

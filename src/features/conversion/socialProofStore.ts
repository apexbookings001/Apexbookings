import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type SocialProofPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type SocialProofAnimation = 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'fade-slide'
export type SocialProofItem = { id: string; avatar?: string; name: string; city: string; state: string; ticketPackage: string; message: string; duration: number; animation: SocialProofAnimation; position: SocialProofPosition; visible: boolean; createdAt: string }
export type SocialProofSettings = {
  enabled: boolean
  paused: boolean
  mode: 'demo' | 'live'
  defaultCustomerName: string
  city: string
  state: string
  customerImage?: string
  packageName: string
  message: string
  duration: number
  delay: number
  animation: SocialProofAnimation
  position: SocialProofPosition
  pageTargeting: string[]
  mobileVisible: boolean
  desktopVisible: boolean
}

type SocialProofState = { items: SocialProofItem[]; settings: SocialProofSettings }

const defaultSettings: SocialProofSettings = {
  enabled: true, paused: false, mode: 'demo', defaultCustomerName: 'Apex Guest', city: 'New York', state: 'US',
  packageName: 'VIP', message: 'just purchased a ticket.', duration: 5, delay: 8, animation: 'fade-slide',
  position: 'bottom-left', pageTargeting: ['event'], mobileVisible: true, desktopVisible: true,
}
const cache = createProtectedMemoryStore<SocialProofState>(() => ({ items: [], settings: defaultSettings }))

const previewItems: SocialProofItem[] = [
  { id: 'preview-new-york', name: 'Olivia B.', city: 'New York', state: 'US', ticketPackage: 'VIP', message: 'just purchased a ticket.', duration: 5, animation: 'fade-slide', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-london', name: 'James R.', city: 'London', state: 'GB', ticketPackage: 'Regular', message: 'just purchased a ticket.', duration: 5, animation: 'slide-up', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-toronto', name: 'Mia C.', city: 'Toronto', state: 'CA', ticketPackage: 'Gold', message: 'just purchased a ticket.', duration: 5, animation: 'scale', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-sydney', name: 'Noah W.', city: 'Sydney', state: 'AU', ticketPackage: 'Platinum', message: 'just purchased a ticket.', duration: 5, animation: 'fade', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
]

function fromRow(row: Record<string, unknown>): SocialProofItem {
  return {
    id: String(row.id),
    avatar: row.avatar_path ? String(row.avatar_path) : undefined,
    name: String(row.name),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    ticketPackage: String(row.ticket_package ?? ''),
    message: String(row.message ?? ''),
    duration: Number(row.duration_seconds ?? 5),
    animation: String(row.animation ?? 'fade-slide') as SocialProofAnimation,
    position: String(row.position ?? 'bottom-left') as SocialProofPosition,
    visible: Boolean(row.visible),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

async function saveItem(item: SocialProofItem) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('social_proof_items').upsert({
    id: item.id,
    organization_id: requireOrganizationId(),
    avatar_path: item.avatar,
    name: item.name,
    city: item.city,
    state: item.state,
    ticket_package: item.ticketPackage,
    message: item.message,
    duration_seconds: item.duration,
    animation: item.animation,
    position: item.position,
    visible: item.visible,
    deleted_at: null,
  }, { onConflict: 'id' })
  if (error) throw error
}

async function saveSettings(settings: SocialProofSettings) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('settings').upsert({ organization_id: requireOrganizationId(), social_proof: settings }, { onConflict: 'organization_id' })
  if (error) throw error
}

export const socialProofStore = {
  list: () => cache.get().items,
  settings: () => cache.get().settings,
  previewItems: () => previewItems,
  defaultItem: (): SocialProofItem => {
    const settings = cache.get().settings
    return { id: 'global-default', avatar: settings.customerImage, name: settings.defaultCustomerName, city: settings.city, state: settings.state, ticketPackage: settings.packageName, message: settings.message, duration: settings.duration, animation: settings.animation, position: settings.position, visible: true, createdAt: new Date().toISOString() }
  },
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const organizationId = requireOrganizationId()
      const [itemsResult, settingsResult] = await Promise.all([
        supabase.from('social_proof_items').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('settings').select('social_proof').eq('organization_id', organizationId).single(),
      ])
      if (itemsResult.error) throw itemsResult.error
      if (settingsResult.error) throw settingsResult.error
      const settings = { ...defaultSettings, ...((settingsResult.data?.social_proof ?? {}) as Partial<SocialProofSettings>) }
      cache.set({ items: (itemsResult.data ?? []).map(row => fromRow(row)), settings })
      return cache.get()
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  hydratePublic: async (eventId: string) => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('public_social_proof', { target_event_id: eventId })
    if (error) throw error
    const result = (data ?? {}) as { items?: Record<string, unknown>[]; settings?: Partial<SocialProofSettings> }
    cache.set({ items: (result.items ?? []).map(fromRow), settings: { ...defaultSettings, ...result.settings } })
  },
  save: (item: SocialProofItem) => {
    const state = cache.get()
    const items = [...state.items]
    const index = items.findIndex(current => current.id === item.id)
    if (index >= 0) items[index] = item
    else items.unshift(item)
    void cache.optimistic({ ...state, items }, () => saveItem(item)).catch(() => undefined)
    return item
  },
  remove: (id: string) => {
    const state = cache.get()
    void cache.optimistic({ ...state, items: state.items.filter(item => item.id !== id) }, async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('social_proof_items').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', requireOrganizationId())
      if (error) throw error
    }).catch(() => undefined)
  },
  updateSettings: (change: Partial<SocialProofSettings>) => {
    const state = cache.get()
    const settings = { ...state.settings, ...change }
    void cache.optimistic({ ...state, settings }, () => saveSettings(settings)).catch(() => undefined)
  },
  duplicate: (item: SocialProofItem) => socialProofStore.save({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, createdAt: new Date().toISOString() }),
  create: (): SocialProofItem => ({ id: crypto.randomUUID(), name: 'New customer', city: '', state: '', ticketPackage: 'Regular', message: 'just purchased a ticket.', duration: 5, animation: 'fade-slide', position: 'bottom-left', visible: true, createdAt: new Date().toISOString() }),
  clear: cache.reset,
}

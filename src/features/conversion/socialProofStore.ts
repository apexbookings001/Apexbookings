import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type SocialProofPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type SocialProofAnimation = 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'fade-slide'
export type SocialProofSourceType = 'verified_booking' | 'manual_message' | 'demo'
export type SocialProofPrivacyMode = 'first_name' | 'first_name_last_initial' | 'anonymous'
export type SocialProofItem = {
  id: string; avatar?: string; name: string; city: string; state: string; country?: string; ticketPackage: string; message: string
  duration: number; animation: SocialProofAnimation; position: SocialProofPosition; visible: boolean; mobileVisible: boolean; desktopVisible: boolean
  sourceType: SocialProofSourceType; bookingId?: string; eventId?: string; displayOrder: number; createdAt: string
}
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
  maxCards: number
  includeVerifiedBookings: boolean
  privacyMode: SocialProofPrivacyMode
}

type SocialProofState = { items: SocialProofItem[]; settings: SocialProofSettings }

const defaultSettings: SocialProofSettings = {
  enabled: false, paused: false, mode: 'live', defaultCustomerName: '', city: '', state: '',
  packageName: 'VIP', message: 'just purchased a ticket.', duration: 5, delay: 8, animation: 'fade-slide',
  position: 'bottom-left', pageTargeting: ['event'], mobileVisible: true, desktopVisible: true, maxCards: 20, includeVerifiedBookings: true, privacyMode: 'first_name',
}
const cache = createProtectedMemoryStore<SocialProofState>(() => ({ items: [], settings: defaultSettings }))

const previewItems: SocialProofItem[] = [
  { id: 'preview-new-york', name: 'Demo guest', city: 'New York', state: 'US', ticketPackage: 'VIP', message: 'Preview data only.', duration: 5, animation: 'fade-slide', position: 'bottom-left', visible: true, mobileVisible: true, desktopVisible: true, sourceType: 'demo', displayOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-london', name: 'Demo guest', city: 'London', state: 'GB', ticketPackage: 'Regular', message: 'Preview data only.', duration: 5, animation: 'slide-up', position: 'bottom-left', visible: true, mobileVisible: true, desktopVisible: true, sourceType: 'demo', displayOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-toronto', name: 'Demo guest', city: 'Toronto', state: 'CA', ticketPackage: 'Gold', message: 'Preview data only.', duration: 5, animation: 'scale', position: 'bottom-left', visible: true, mobileVisible: true, desktopVisible: true, sourceType: 'demo', displayOrder: 2, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-sydney', name: 'Demo guest', city: 'Sydney', state: 'AU', ticketPackage: 'Platinum', message: 'Preview data only.', duration: 5, animation: 'fade', position: 'bottom-left', visible: true, mobileVisible: true, desktopVisible: true, sourceType: 'demo', displayOrder: 3, createdAt: '2026-01-01T00:00:00.000Z' },
]

function fromRow(row: Record<string, unknown>): SocialProofItem {
  return {
    id: String(row.id),
    avatar: row.avatar_path ? String(row.avatar_path) : undefined,
    name: String(row.name),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    country: row.country ? String(row.country) : undefined,
    ticketPackage: String(row.ticket_package ?? ''),
    message: String(row.message ?? ''),
    duration: Number(row.duration_seconds ?? 5),
    animation: String(row.animation ?? 'fade-slide') as SocialProofAnimation,
    position: String(row.position ?? 'bottom-left') as SocialProofPosition,
    visible: Boolean(row.visible),
    mobileVisible: row.mobile_visible !== false,
    desktopVisible: row.desktop_visible !== false,
    sourceType: (row.source_type === 'verified_booking' || row.source_type === 'demo' ? row.source_type : 'manual_message'),
    bookingId: row.booking_id ? String(row.booking_id) : undefined,
    eventId: row.event_id ? String(row.event_id) : undefined,
    displayOrder: Number(row.display_order ?? 0),
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
    mobile_visible: item.mobileVisible,
    desktop_visible: item.desktopVisible,
    source_type: item.sourceType,
    booking_id: item.bookingId ?? null,
    event_id: item.eventId ?? null,
    country: item.country ?? null,
    display_order: item.displayOrder,
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
    return { id: 'global-default', avatar: settings.customerImage, name: settings.defaultCustomerName, city: settings.city, state: settings.state, ticketPackage: settings.packageName, message: settings.message, duration: settings.duration, animation: settings.animation, position: settings.position, visible: true, mobileVisible: true, desktopVisible: true, sourceType: 'manual_message', displayOrder: 0, createdAt: new Date().toISOString() }
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
      // A newly provisioned organization may not have a settings row yet.
      // That is a valid state: retain the safe disabled defaults until an
      // administrator saves the first configuration.
      if (settingsResult.error && settingsResult.error.code !== 'PGRST116') throw settingsResult.error
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
  create: (): SocialProofItem => ({ id: crypto.randomUUID(), name: 'Promotion', city: '', state: '', ticketPackage: '', message: 'Early-bird pricing ends soon.', duration: 5, animation: 'fade-slide', position: 'bottom-left', visible: true, mobileVisible: true, desktopVisible: true, sourceType: 'manual_message', displayOrder: 0, createdAt: new Date().toISOString() }),
  clear: cache.reset,
}

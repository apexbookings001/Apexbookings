import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type OrganizationSettings = { name: string; website: string; supportEmail: string; phone: string }
export type BrandingSettings = { name: string; accent: string; tagline: string }
export type NotificationPreferences = { bookings: boolean; payments: boolean; support: boolean; daily: boolean }
export type AdminSettingsState = { organization: OrganizationSettings; branding: BrandingSettings; notifications: NotificationPreferences }

const defaults: AdminSettingsState = {
  organization: { name: 'Apex Bookings', website: '', supportEmail: '', phone: '' },
  branding: { name: 'Apex Bookings', accent: '#00FF88', tagline: 'Premium live experiences' },
  notifications: { bookings: true, payments: true, support: true, daily: false },
}
const cache = createProtectedMemoryStore<AdminSettingsState>(() => structuredClone(defaults))

export const adminSettingsStore = {
  get: () => cache.get(),
  subscribe: cache.subscribe,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const organizationId = requireOrganizationId()
      const [organizationResult, settingsResult] = await Promise.all([
        supabase.from('organizations').select('name,metadata').eq('id', organizationId).single(),
        supabase.from('settings').select('branding,notification_settings').eq('organization_id', organizationId).single(),
      ])
      if (organizationResult.error) throw organizationResult.error
      if (settingsResult.error) throw settingsResult.error
      const metadata = (organizationResult.data.metadata ?? {}) as Partial<OrganizationSettings>
      const state = {
        organization: { ...defaults.organization, ...metadata, name: organizationResult.data.name },
        branding: { ...defaults.branding, ...((settingsResult.data.branding ?? {}) as Partial<BrandingSettings>) },
        notifications: { ...defaults.notifications, ...((settingsResult.data.notification_settings ?? {}) as Partial<NotificationPreferences>) },
      }
      cache.set(state)
      return state
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  saveOrganization: (organization: OrganizationSettings) => {
    const state = cache.get()
    void cache.optimistic({ ...state, organization }, async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('organizations').update({ name: organization.name, metadata: { website: organization.website, supportEmail: organization.supportEmail, phone: organization.phone } }).eq('id', requireOrganizationId())
      if (error) throw error
    }).catch(() => undefined)
  },
  saveBranding: (branding: BrandingSettings) => {
    const state = cache.get()
    void cache.optimistic({ ...state, branding }, async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('settings').update({ branding }).eq('organization_id', requireOrganizationId())
      if (error) throw error
    }).catch(() => undefined)
  },
  saveNotifications: (notifications: NotificationPreferences) => {
    const state = cache.get()
    void cache.optimistic({ ...state, notifications }, async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('settings').update({ notification_settings: notifications }).eq('organization_id', requireOrganizationId())
      if (error) throw error
    }).catch(() => undefined)
  },
  clear: cache.reset,
}

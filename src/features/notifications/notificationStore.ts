import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'
import { softDeleteAdminRecord } from '../admin/adminDeletionService'

export type AdminNotification = { id: string; type: string; title: string; detail: string; createdAt: string; readAt?: string }
const cache = createProtectedMemoryStore<AdminNotification[]>(() => [])

function fromRow(row: Record<string, unknown>): AdminNotification {
  const payload = (row.payload ?? {}) as Record<string, unknown>
  const title = String(payload.title ?? payload.customerName ?? payload.eventName ?? String(row.type).replace(/_/g, ' '))
  const detail = String(payload.detail ?? payload.reference ?? payload.bookingId ?? payload.conversationId ?? '')
  return { id: String(row.id), type: String(row.type), title, detail, createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : undefined }
}

export const notificationStore = {
  list: () => cache.get(),
  unreadCount: () => cache.get().filter(notification => !notification.readAt).length,
  subscribe: cache.subscribe,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const { data, error } = await supabase.from('notifications').select('id,type,payload,read_at,created_at').eq('organization_id', requireOrganizationId()).is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      const notifications = (data ?? []).map(row => fromRow(row as Record<string, unknown>))
      cache.set(notifications)
      return notifications
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  markRead: (id: string) => {
    const readAt = new Date().toISOString()
    const next = cache.get().map(notification => notification.id === id ? { ...notification, readAt } : notification)
    void cache.optimistic(next, async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', id).eq('organization_id', requireOrganizationId())
      if (error) throw error
    }).catch(() => undefined)
  },
  markAllRead: () => {
    const readAt = new Date().toISOString()
    void cache.optimistic(cache.get().map(notification => ({ ...notification, readAt })), async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('notifications').update({ read_at: readAt }).eq('organization_id', requireOrganizationId()).is('read_at', null)
      if (error) throw error
    }).catch(() => undefined)
  },
  deleteOne: async (id: string) => {
    await softDeleteAdminRecord('notification', id)
    cache.set(cache.get().filter(notification => notification.id !== id))
  },
  deleteMany: async (ids: string[]) => {
    for (const id of ids) await softDeleteAdminRecord('notification', id)
    const removed = new Set(ids)
    cache.set(cache.get().filter(notification => !removed.has(notification.id)))
  },
  clearRead: async () => {
    const ids = cache.get().filter(notification => notification.readAt).map(notification => notification.id)
    for (const id of ids) await softDeleteAdminRecord('notification', id)
    const removed = new Set(ids)
    cache.set(cache.get().filter(notification => !removed.has(notification.id)))
  },
  clear: cache.reset,
}

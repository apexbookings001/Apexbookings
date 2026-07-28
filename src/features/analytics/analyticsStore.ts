import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type AnalyticsEvent = { eventId: string; views: number; uniqueVisitors: string[]; ctaClicks: number; faqViews: number; mapClicks: number; packageClicks: number; updatedAt: string }
const cache = createProtectedMemoryStore<AnalyticsEvent[]>(() => [])
const visitorId = crypto.randomUUID()
const empty = (eventId: string): AnalyticsEvent => ({ eventId, views: 0, uniqueVisitors: [], ctaClicks: 0, faqViews: 0, mapClicks: 0, packageClicks: 0, updatedAt: new Date().toISOString() })

export const analyticsStore = {
  get: (eventId: string) => cache.get().find(metric => metric.eventId === eventId) ?? empty(eventId),
  subscribe: cache.subscribe,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const { data, error } = await supabase.from('analytics_events').select('event_id,event_type,visitor_id,created_at').eq('organization_id', requireOrganizationId()).order('created_at')
      if (error) throw error
      const metrics = new Map<string, AnalyticsEvent>()
      for (const row of data ?? []) {
        if (!row.event_id) continue
        const metric = metrics.get(row.event_id) ?? empty(row.event_id)
        if (row.event_type === 'views') metric.views += 1
        if (row.event_type === 'ctaClicks') metric.ctaClicks += 1
        if (row.event_type === 'faqViews') metric.faqViews += 1
        if (row.event_type === 'mapClicks') metric.mapClicks += 1
        if (row.event_type === 'packageClicks') metric.packageClicks += 1
        if (row.visitor_id && !metric.uniqueVisitors.includes(row.visitor_id)) metric.uniqueVisitors.push(row.visitor_id)
        metric.updatedAt = row.created_at
        metrics.set(row.event_id, metric)
      }
      const result = [...metrics.values()]
      cache.set(result)
      return result
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  record: (eventId: string, action: keyof Omit<AnalyticsEvent, 'eventId' | 'uniqueVisitors' | 'updatedAt'>) => {
    const metric = analyticsStore.get(eventId)
    const next = { ...metric, uniqueVisitors: [...metric.uniqueVisitors], updatedAt: new Date().toISOString() }
    next[action] += 1
    if (action === 'views' && !next.uniqueVisitors.includes(visitorId)) next.uniqueVisitors.push(visitorId)
    cache.set([next, ...cache.get().filter(item => item.eventId !== eventId)])
    if (supabase) void supabase.rpc('record_public_analytics', { target_event_id: eventId, analytics_type: action, analytics_visitor_id: visitorId, analytics_payload: {} }).then(({ error }) => { if (error) cache.fail(error) })
    return next
  },
  clear: cache.reset,
}

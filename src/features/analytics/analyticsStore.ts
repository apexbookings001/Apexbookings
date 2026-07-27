export type AnalyticsEvent = { eventId: string; views: number; uniqueVisitors: string[]; ctaClicks: number; faqViews: number; mapClicks: number; packageClicks: number; updatedAt: string }
const key = 'apex.analytics'
const read = (): AnalyticsEvent[] => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as AnalyticsEvent[] : [] } catch { return [] } }
const write = (events: AnalyticsEvent[]) => localStorage.setItem(key, JSON.stringify(events))
const visitor = () => { const id = localStorage.getItem('apex.visitor-id') ?? crypto.randomUUID(); localStorage.setItem('apex.visitor-id', id); return id }
const ensure = (eventId: string) => read().find(item => item.eventId === eventId) ?? { eventId, views: 0, uniqueVisitors: [], ctaClicks: 0, faqViews: 0, mapClicks: 0, packageClicks: 0, updatedAt: new Date().toISOString() }
export const analyticsStore = {
  get: (eventId: string) => ensure(eventId),
  record: (eventId: string, action: keyof Omit<AnalyticsEvent, 'eventId' | 'uniqueVisitors' | 'updatedAt'>) => { const metric = ensure(eventId); if (action === 'views') { metric.views += 1; const id = visitor(); if (!metric.uniqueVisitors.includes(id)) metric.uniqueVisitors.push(id) } else metric[action] += 1; metric.updatedAt = new Date().toISOString(); const all = read(); const index = all.findIndex(item => item.eventId === eventId); if (index < 0) all.push(metric); else all[index] = metric; write(all); return metric },
}

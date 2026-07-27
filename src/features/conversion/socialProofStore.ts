export type SocialProofPosition = 'bottom-left' | 'bottom-center' | 'bottom-right'
export type SocialProofAnimation = 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'fade-slide'
export type SocialProofItem = { id: string; avatar?: string; name: string; city: string; state: string; ticketPackage: string; message: string; duration: number; animation: SocialProofAnimation; position: SocialProofPosition; visible: boolean; createdAt: string }
export type SocialProofSettings = { enabled: boolean; paused: boolean; mode: 'demo' | 'live' }

const key = 'apex.social-proof'
const settingsKey = 'apex.social-proof-settings'
const changeEvent = 'apex:social-proof'
const notify = () => window.dispatchEvent(new Event(changeEvent))
const previewItems: SocialProofItem[] = [
  { id: 'preview-new-york', name: 'Olivia B.', city: 'New York', state: 'US', ticketPackage: 'VIP', message: 'just purchased a ticket.', duration: 5, animation: 'fade-slide', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-london', name: 'James R.', city: 'London', state: 'GB', ticketPackage: 'Regular', message: 'just purchased a ticket.', duration: 5, animation: 'slide-up', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-toronto', name: 'Mia C.', city: 'Toronto', state: 'CA', ticketPackage: 'Gold', message: 'just purchased a ticket.', duration: 5, animation: 'scale', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'preview-sydney', name: 'Noah W.', city: 'Sydney', state: 'AU', ticketPackage: 'Platinum', message: 'just purchased a ticket.', duration: 5, animation: 'fade', position: 'bottom-left', visible: true, createdAt: '2026-01-01T00:00:00.000Z' },
]
const read = (): SocialProofItem[] => { try { const saved = localStorage.getItem(key); return saved ? (JSON.parse(saved) as SocialProofItem[]).filter(item => !item.id.startsWith('demo-')) : [] } catch { return [] } }
const write = (items: SocialProofItem[]) => { localStorage.setItem(key, JSON.stringify(items)); notify() }
const readSettings = (): SocialProofSettings => { try { return { enabled: true, paused: false, mode: 'demo', ...JSON.parse(localStorage.getItem(settingsKey) ?? '{}') } } catch { return { enabled: true, paused: false, mode: 'demo' } } }

async function organizationId(): Promise<string | null> { if (!supabase) return null; const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) return null; const { data, error } = await supabase.rpc('bootstrap_admin_workspace'); return error || !data ? null : String(data) }
async function syncItem(item: SocialProofItem): Promise<void> { const orgId = await organizationId(); if (!supabase || !orgId) return; await supabase.from('social_proof_items').upsert({ id: item.id, organization_id: orgId, avatar_path: item.avatar, name: item.name, city: item.city, state: item.state, ticket_package: item.ticketPackage, message: item.message, duration_seconds: item.duration, animation: item.animation, position: item.position, visible: item.visible }, { onConflict: 'id' }) }
async function syncSettings(settings: SocialProofSettings): Promise<void> { const orgId = await organizationId(); if (!supabase || !orgId) return; await supabase.from('settings').upsert({ organization_id: orgId, social_proof: settings }, { onConflict: 'organization_id' }) }

export const socialProofStore = {
  list: () => read(), settings: () => readSettings(), previewItems: () => previewItems,
  subscribe: (listener: () => void) => { window.addEventListener(changeEvent, listener); return () => window.removeEventListener(changeEvent, listener) },
  save: (item: SocialProofItem) => { const items = read(); const index = items.findIndex(current => current.id === item.id); if (index >= 0) items[index] = item; else items.unshift(item); write(items); void syncItem(item).catch(() => undefined); return item },
  remove: (id: string) => { write(read().filter(item => item.id !== id)); void (async () => { const orgId = await organizationId(); if (supabase && orgId) await supabase.from('social_proof_items').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId) })().catch(() => undefined) },
  updateSettings: (change: Partial<SocialProofSettings>) => { const settings = { ...readSettings(), ...change }; localStorage.setItem(settingsKey, JSON.stringify(settings)); notify(); void syncSettings(settings).catch(() => undefined) },
  duplicate: (item: SocialProofItem) => socialProofStore.save({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, createdAt: new Date().toISOString() }),
  create: (): SocialProofItem => ({ id: crypto.randomUUID(), name: 'New customer', city: 'New York', state: 'NY', ticketPackage: 'Regular', message: 'just purchased a ticket.', duration: 5, animation: 'fade-slide', position: 'bottom-left', visible: true, createdAt: new Date().toISOString() }),
}
import { supabase } from '../../lib/supabase'

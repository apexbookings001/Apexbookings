import type { RealtimeChannel } from '@supabase/supabase-js'
import { requireSupabase } from './client'

export type RealtimeTable =
  | 'bookings'
  | 'payments'
  | 'notifications'
  | 'support_conversations'
  | 'chat_messages'
  | 'events'
  | 'settings'
  | 'packages'
  | 'seats'
  | 'payment_methods'
  | 'crypto_wallets'
  | 'social_proof_items'
  | 'media'

export function subscribeToTable(table: RealtimeTable, filter: string | undefined, onChange: () => void): RealtimeChannel {
  const options = { event: '*' as const, schema: 'public', table, ...(filter ? { filter } : {}) }
  return requireSupabase().channel(`workspace:${table}:${filter ?? 'rls'}`).on('postgres_changes', options, onChange).subscribe()
}
export function unsubscribe(channel: RealtimeChannel): void { void requireSupabase().removeChannel(channel) }

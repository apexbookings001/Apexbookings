import type { RealtimeChannel } from '@supabase/supabase-js'
import { requireSupabase } from './client'

export function subscribeToTable(table: 'messages' | 'notifications' | 'seats' | 'payments', filter: string, onChange: () => void): RealtimeChannel {
  return requireSupabase().channel(`${table}:${filter}`).on('postgres_changes', { event: '*', schema: 'public', table, filter }, onChange).subscribe()
}
export function unsubscribe(channel: RealtimeChannel): void { void requireSupabase().removeChannel(channel) }
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export function toServiceError(error: unknown): Error {
  return error instanceof Error ? error : new Error('An unexpected data service error occurred.')
}
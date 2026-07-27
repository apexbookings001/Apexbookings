import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey)
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseConfig.url!, supabaseConfig.anonKey!)
  : null
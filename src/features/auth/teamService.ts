import { supabase } from '../../lib/supabase'
import type { OrganizationRole } from '../../services/supabase/workspace'

export type TeamMember = { userId: string; email: string; role: OrganizationRole; createdAt: string; disabled: boolean }

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('team-admin', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as T
}

export const teamService = {
  list: async () => (await invoke<{ members: TeamMember[] }>({ action: 'list' })).members,
  invite: async (email: string, role: OrganizationRole) => invoke<{ ok: true }>({ action: 'invite', email, role }),
}

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

type InvitePayload = { action?: 'list' | 'invite'; email?: string; role?: string }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)
  if (!authorization) return json({ error: 'Authentication is required' }, 401)

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Your session is invalid or expired' }, 401)

  const { data: ownerMembership } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', authData.user.id)
    .is('disabled_at', null)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ownerMembership || ownerMembership.role !== 'owner') return json({ error: 'Only an organization owner can invite team members' }, 403)

  const payload = await request.json().catch(() => null) as InvitePayload | null
  if (payload?.action === 'list') {
    const { data: memberships, error: membershipListError } = await admin
      .from('organization_members')
      .select('user_id,role,created_at,disabled_at')
      .eq('organization_id', ownerMembership.organization_id)
      .is('deleted_at', null)
      .order('created_at')
    if (membershipListError) return json({ error: 'Team members could not be loaded' }, 500)
    const members = await Promise.all((memberships ?? []).map(async membership => {
      const { data } = await admin.auth.admin.getUserById(membership.user_id)
      return { userId: membership.user_id, email: data.user?.email ?? 'Unknown account', role: membership.role, createdAt: membership.created_at, disabled: Boolean(membership.disabled_at) }
    }))
    return json({ members })
  }

  const email = payload?.email?.trim().toLowerCase()
  const role = payload?.role
  if (payload?.action !== 'invite' || !email || !role || !['owner', 'admin', 'support'].includes(role)) return json({ error: 'A valid email and role are required' }, 400)
  if (email === authData.user.email?.toLowerCase()) return json({ error: 'You already belong to this organization' }, 409)

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${Deno.env.get('APP_ORIGIN') ?? ''}/admin/login`,
  })
  if (inviteError || !invited.user) {
    const duplicate = inviteError?.message.toLowerCase().includes('already')
    return json({ error: duplicate ? 'That account has already been invited' : 'The invitation could not be sent' }, duplicate ? 409 : 400)
  }

  const { error: membershipError } = await admin.from('organization_members').insert({
    organization_id: ownerMembership.organization_id,
    user_id: invited.user.id,
    role,
  })
  if (membershipError) {
    await admin.auth.admin.deleteUser(invited.user.id)
    const duplicate = membershipError.code === '23505'
    return json({ error: duplicate ? 'That account already belongs to this organization' : 'The invitation membership could not be created' }, duplicate ? 409 : 500)
  }

  return json({ ok: true, userId: invited.user.id, role })
})

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
type Payload = { action?: 'sign' | 'complete'; conversationToken?: string; name?: string; mimeType?: string; size?: number; path?: string; metadata?: Record<string, unknown> }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)
  const payload = await request.json().catch(() => null) as Payload | null
  if (!payload?.action || !payload.conversationToken || !payload.name || !payload.mimeType || !payload.size || payload.size > 20 * 1024 * 1024) return json({ error: 'Invalid chat upload request' }, 400)
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: conversation, error } = await admin.from('support_conversations').select('id,organization_id').eq('access_token', payload.conversationToken).is('deleted_at', null).single()
  if (error || !conversation) return json({ error: 'Conversation was not found' }, 404)
  const prefix = `${conversation.organization_id}/${conversation.id}/`

  if (payload.action === 'sign') {
    const safeName = payload.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
    const path = `${prefix}${crypto.randomUUID()}-${safeName}`
    const signed = await admin.storage.from('chat-files').createSignedUploadUrl(path)
    if (signed.error || !signed.data) return json({ error: 'A secure chat upload could not be prepared' }, 500)
    return json({ path, token: signed.data.token })
  }

  if (!payload.path?.startsWith(prefix)) return json({ error: 'Invalid chat file path' }, 400)
  const mediaId = crypto.randomUUID()
  const insert = await admin.from('media').insert({ id: mediaId, organization_id: conversation.organization_id, bucket: 'chat-files', path: payload.path, mime_type: payload.mimeType, size_bytes: payload.size, is_chat_media: true, metadata: { ...payload.metadata, name: payload.name, conversationId: conversation.id } })
  if (insert.error) return json({ error: 'Chat media metadata could not be saved' }, 500)
  const signed = await admin.storage.from('chat-files').createSignedUrl(payload.path, 7 * 24 * 60 * 60)
  return json({ mediaId, url: signed.data?.signedUrl ?? '' })
})

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

type FileInput = { name: string; mimeType: string; size: number; path?: string }
type Payload = { action?: 'sign' | 'complete'; paymentId?: string; bankRequestId?: string; files?: FileInput[] }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const payload = await request.json().catch(() => null) as Payload | null
  if (!payload?.action || !payload.paymentId || !payload.files?.length || payload.files.length > 6) return json({ error: 'Invalid payment proof request' }, 400)
  if (payload.files.some(file => !allowedTypes.includes(file.mimeType) || file.size <= 0 || file.size > 20 * 1024 * 1024)) return json({ error: 'Proof files must be JPG, PNG, WEBP, or PDF and no larger than 20 MB' }, 400)

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select('id,booking_id,metadata,bookings!inner(events!inner(organization_id))')
    .eq('id', payload.paymentId)
    .is('deleted_at', null)
    .single()
  if (paymentError || !payment) return json({ error: 'Payment was not found' }, 404)
  const booking = payment.bookings as unknown as { events: { organization_id: string } }
  const organizationId = booking.events.organization_id
  const pathPrefix = `${organizationId}/${payment.id}/`

  if (payload.action === 'sign') {
    const uploads = []
    for (const file of payload.files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
      const path = `${pathPrefix}${crypto.randomUUID()}-${safeName}`
      const { data, error } = await admin.storage.from('payment-proofs').createSignedUploadUrl(path)
      if (error || !data) return json({ error: 'A secure upload URL could not be created' }, 500)
      uploads.push({ path, token: data.token })
    }
    return json({ uploads })
  }

  if (payload.files.some(file => !file.path?.startsWith(pathPrefix))) return json({ error: 'Invalid proof path' }, 400)
  const mediaRows = payload.files.map(file => ({
    organization_id: organizationId,
    bucket: 'payment-proofs',
    path: file.path,
    mime_type: file.mimeType,
    size_bytes: file.size,
    is_chat_media: false,
  }))
  const { data: media, error: mediaError } = await admin.from('media').upsert(mediaRows, { onConflict: 'bucket,path' }).select('id,path')
  if (mediaError || !media) return json({ error: 'Uploaded proof metadata could not be saved' }, 500)
  const { error: proofError } = await admin.from('payment_proofs').upsert(media.map(item => ({ payment_id: payment.id, media_id: item.id })), { onConflict: 'payment_id,media_id' })
  if (proofError) return json({ error: 'Payment proof records could not be saved' }, 500)

  const existingMetadata = (payment.metadata ?? {}) as Record<string, unknown>
  await admin.from('payments').update({ status: 'pending', metadata: { ...existingMetadata, proofPaths: media.map(item => item.path) } }).eq('id', payment.id)
  await admin.from('bookings').update({ payment_state: 'payment_submitted' }).eq('id', payment.booking_id)
  if (payload.bankRequestId) await admin.from('bank_transfer_requests').update({ status: 'payment_proof_submitted' }).eq('id', payload.bankRequestId).eq('booking_id', payment.booking_id)
  await admin.from('notifications').insert({ organization_id: organizationId, type: 'payment_proof', payload: { paymentId: payment.id, bookingId: payment.booking_id } })
  return json({ ok: true })
})

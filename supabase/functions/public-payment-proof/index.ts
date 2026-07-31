import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsJson, corsPreflight } from '../_shared/cors.ts'

const json = (request: Request, body: unknown, status = 200) => corsJson(request, body, status)
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

type FileInput = { name: string; mimeType: string; size: number; path?: string }
type Payload = { action?: 'sign' | 'complete'; paymentId?: string; bankRequestId?: string; files?: FileInput[] }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return corsPreflight(request)
  try {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return json(request, { error: 'Server configuration is incomplete' }, 500)
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const payload = await request.json().catch(() => null) as Payload | null
  if (!payload?.action || !payload.paymentId || !payload.files?.length || payload.files.length > 6) return json(request, { error: 'Invalid payment proof request' }, 400)
  if (payload.files.some(file => !allowedTypes.includes(file.mimeType) || file.size <= 0 || file.size > 20 * 1024 * 1024)) return json(request, { error: 'Proof files must be JPG, PNG, WEBP, or PDF and no larger than 20 MB' }, 400)

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select('id,booking_id,metadata,bookings!inner(events!inner(organization_id))')
    .eq('id', payload.paymentId)
    .is('deleted_at', null)
    .single()
  if (paymentError || !payment) return json(request, { error: 'Payment was not found' }, 404)

  // Safely extract organizationId whether PostgREST returns object or array
  const rawBooking = Array.isArray(payment.bookings) ? payment.bookings[0] : payment.bookings
  const rawEvents = rawBooking?.events
  const rawEvent = Array.isArray(rawEvents) ? rawEvents[0] : rawEvents
  const organizationId = rawEvent?.organization_id

  if (!organizationId) {
    console.error('[public-payment-proof] Could not resolve organization_id for payment:', payload.paymentId, payment)
    return json(request, { error: 'Organization details could not be resolved for this payment' }, 500)
  }

  const pathPrefix = `${organizationId}/${payment.id}/`

  if (payload.action === 'sign') {
    const uploads = []
    for (const file of payload.files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
      const path = `${pathPrefix}${crypto.randomUUID()}-${safeName}`
      const { data, error } = await admin.storage.from('payment-proofs').createSignedUploadUrl(path)
      if (error || !data) return json(request, { error: 'A secure upload URL could not be created' }, 500)
      uploads.push({ path, token: data.token })
    }
    return json(request, { uploads })
  }

  if (payload.files.some(file => !file.path?.startsWith(pathPrefix))) return json(request, { error: 'Invalid proof path' }, 400)
  const mediaRows = payload.files.map(file => ({
    organization_id: organizationId,
    bucket: 'payment-proofs',
    path: file.path,
    mime_type: file.mimeType,
    size_bytes: file.size,
    is_chat_media: false,
  }))
  const { data: media, error: mediaError } = await admin.from('media').upsert(mediaRows, { onConflict: 'bucket,path' }).select('id,path')
  if (mediaError || !media) {
    console.error('[public-payment-proof] Media upsert error:', mediaError)
    return json(request, { error: 'Uploaded proof metadata could not be saved' }, 500)
  }
  const { error: proofError } = await admin.from('payment_proofs').upsert(media.map(item => ({ payment_id: payment.id, media_id: item.id })), { onConflict: 'payment_id,media_id' })
  if (proofError) {
    console.error('[public-payment-proof] Payment proof upsert error:', proofError)
    return json(request, { error: 'Payment proof records could not be saved' }, 500)
  }

  const existingMetadata = (payment.metadata ?? {}) as Record<string, unknown>
  await admin.from('payments').update({ status: 'pending', metadata: { ...existingMetadata, proofPaths: media.map(item => item.path) } }).eq('id', payment.id)
  await admin.from('bookings').update({ payment_state: 'payment_submitted' }).eq('id', payment.booking_id)
  if (payload.bankRequestId) await admin.from('bank_transfer_requests').update({ status: 'payment_proof_submitted' }).eq('id', payload.bankRequestId).eq('booking_id', payment.booking_id)
  await admin.from('notifications').insert({ organization_id: organizationId, type: 'payment_proof', payload: { paymentId: payment.id, bookingId: payment.booking_id } })
  return json(request, { ok: true })
  } catch (error) {
    console.error('[public-payment-proof] Unexpected request failure', error)
    return json(request, { error: 'Payment proof processing failed. Please retry.' }, 500)
  }
})

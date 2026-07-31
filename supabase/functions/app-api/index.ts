import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.10.1'
import QRCode from 'npm:qrcode@1.5.4'
import { corsJson, corsPreflight } from '../_shared/cors.ts'

type EmailJob = { id: string; kind: string; recipient: string; subject: string; payload: Record<string, unknown> }

const json = (request: Request, body: unknown, status = 200) => corsJson(request, body, status)
const base64 = (bytes: Uint8Array) => {
  let text = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(text)
}

function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char))
}

function renderEmail(job: EmailJob, logoCid?: string) {
  const fields = Object.entries(job.payload).filter(([label, value]) => !['actionUrl', 'actionLabel'].includes(label) && (typeof value === 'string' || typeof value === 'number')).map(([label, value]) => `<tr><td style="padding:8px 0;color:#a1a1aa">${escape(label)}</td><td style="padding:8px 0;text-align:right;color:#fafafa;font-weight:600">${escape(value)}</td></tr>`).join('')
  const actionUrl = typeof job.payload.actionUrl === 'string' ? job.payload.actionUrl : undefined
  const actionLabel = typeof job.payload.actionLabel === 'string' ? job.payload.actionLabel : 'Open Apex Bookings'
  const header = logoCid
    ? `<img src="cid:${logoCid}" alt="Apex Bookings" width="170" height="96" style="display:block;width:170px;height:96px;margin:0 auto;object-fit:contain;object-position:center"/>`
    : '<strong style="font-size:22px;color:#fafafa">Apex Bookings</strong>'
  const ticketPass = job.kind === 'ticket_ready' && actionUrl ? `<div style="margin:22px 0;padding:22px;text-align:center;border:1px solid #00ff8855;border-radius:20px;background:linear-gradient(145deg,#151519,#0b0b0d)"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00ff88;font-weight:700">Approved · Verified digital ticket</div><img src="cid:apex-ticket-qr@apexbookings" alt="Unique ticket QR code" width="190" height="190" style="display:block;width:190px;height:190px;margin:18px auto 12px;padding:12px;background:#fff;border-radius:18px"/><div style="font-size:12px;color:#a1a1aa">Scan this unique code to open the verified ticket record.</div></div>` : ''
  return `<!doctype html><html><body style="margin:0;background:#09090b;font-family:Arial,sans-serif;color:#fafafa"><main style="max-width:600px;margin:24px auto;background:#111113;border:1px solid #27272a;border-radius:22px;overflow:hidden"><header style="padding:16px 26px;background:#030303;text-align:center">${header}</header><section style="padding:28px"><h1 style="font-size:22px;margin:0 0 16px;color:#fafafa">${escape(job.subject)}</h1><table style="width:100%;font-size:14px">${fields}</table>${ticketPass}${actionUrl ? `<a href="${escape(actionUrl)}" style="display:inline-block;margin-top:24px;padding:13px 18px;border-radius:12px;background:#00ff88;color:#09090b;text-decoration:none;font-weight:700">${escape(actionLabel)}</a>` : ''}</section><footer style="padding:18px 28px;background:#18181b;color:#a1a1aa;font-size:12px">Apex Bookings · Secure event booking</footer></main></body></html>`
}

async function isAdmin(request: Request, admin: ReturnType<typeof createClient>) {
  const authorization = request.headers.get('Authorization')
  if (!authorization) return false
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data } = await admin.auth.getUser(token)
  if (!data.user) return false
  const { data: membership } = await admin
    .from('organization_members')
    .select('role')
    .eq('user_id', data.user.id)
    .is('disabled_at', null)
    .is('deleted_at', null)
    .maybeSingle()
  return Boolean(membership && ['owner', 'admin', 'support'].includes(membership.role))
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return corsPreflight(request)
  try {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(request, { error: 'Server configuration is incomplete' }, 500)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const payload = await request.json().catch(() => null) as { action?: string; emailId?: string } | null
  const publicAdminEmail = payload?.action === 'send-public-admin-email'
  if ((payload?.action !== 'send-email' && !publicAdminEmail) || !payload.emailId) return json(request, { error: 'Invalid request' }, 400)
  if (!publicAdminEmail && !await isAdmin(request, admin)) return json(request, { error: 'Unauthorized' }, 401)

  const { data: job, error } = await admin.from('email_queue').select('id,kind,recipient,subject,payload').eq('id', payload.emailId).eq('status', 'queued').single()
  if (error || !job) return json(request, { error: 'Email job was not found or is no longer queued' }, 404)
  if (publicAdminEmail && job.payload?.publicAdminNotification !== true) return json(request, { error: 'Unauthorized' }, 401)

  await admin.from('email_queue').update({ status: 'processing' }).eq('id', job.id)
  const smtpUser = Deno.env.get('GMAIL_SMTP_USER')
  const smtpPassword = Deno.env.get('GMAIL_SMTP_APP_PASSWORD')
  if (!smtpUser || !smtpPassword) {
    await admin.from('email_queue').update({ status: 'failed', error: 'Gmail SMTP secrets are not configured' }).eq('id', job.id)
    return json(request, { error: 'Gmail SMTP secrets are not configured' }, 503)
  }

  try {
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPassword } })
    const email = job as EmailJob
    const actionUrl = typeof email.payload.actionUrl === 'string' ? email.payload.actionUrl : ''
    const appOrigin = (Deno.env.get('APP_ORIGIN') ?? '').replace(/\/$/, '')
    const logoCid = 'apex-logo@apexbookings'
    const attachments: Array<Record<string, unknown>> = []
    if (appOrigin) {
      const logo = await fetch(`${appOrigin}/apex-email-ticket-logo.png`).catch(() => null)
      if (logo?.ok) attachments.push({ filename: 'apex-bookings-logo.png', content: base64(new Uint8Array(await logo.arrayBuffer())), encoding: 'base64', contentType: 'image/png', cid: logoCid, contentDisposition: 'inline' })
    }
    if (email.kind === 'ticket_ready' && actionUrl) {
      const dataUrl = await QRCode.toDataURL(actionUrl, { type: 'image/png', width: 420, margin: 2, errorCorrectionLevel: 'H' })
      attachments.push({ filename: 'apex-ticket-qr.png', content: dataUrl.slice(dataUrl.indexOf(',') + 1), encoding: 'base64', contentType: 'image/png', cid: 'apex-ticket-qr@apexbookings', contentDisposition: 'inline' })
    }
    await transport.sendMail({ from: `Apex Bookings <${smtpUser}>`, to: email.recipient, subject: email.subject, html: renderEmail(email, attachments.some(item => item.cid === logoCid) ? logoCid : undefined), attachments })
    await admin.from('email_queue').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', job.id)
    return json(request, { ok: true })
  } catch (mailError) {
    await admin.from('email_queue').update({ status: 'failed', error: mailError instanceof Error ? mailError.message : 'SMTP delivery failed' }).eq('id', job.id)
    return json(request, { error: 'SMTP delivery failed' }, 502)
  }
  } catch (error) {
    console.error('[app-api] Unexpected request failure', error)
    return json(request, { error: 'Unable to deliver the email right now' }, 500)
  }
})

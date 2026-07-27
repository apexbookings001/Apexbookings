import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.10.1'

type EmailJob = {
  id: string
  recipient: string
  subject: string
  payload: Record<string, unknown>
}

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char))
}

function renderEmail(job: EmailJob) {
  const fields = Object.entries(job.payload)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([label, value]) => `<tr><td style="padding:8px 0;color:#a1a1aa">${escape(label)}</td><td style="padding:8px 0;text-align:right;color:#fafafa;font-weight:600">${escape(value)}</td></tr>`)
    .join('')
  const actionUrl = typeof job.payload.actionUrl === 'string' ? job.payload.actionUrl : undefined
  const actionLabel = typeof job.payload.actionLabel === 'string' ? job.payload.actionLabel : 'Open Apex Bookings'
  return `<!doctype html><html><body style="margin:0;background:#09090b;font-family:Arial,sans-serif;color:#fafafa"><main style="max-width:600px;margin:24px auto;background:#111113;border:1px solid #27272a;border-radius:22px;overflow:hidden"><header style="padding:26px;background:linear-gradient(135deg,#00ff88,#00c866);color:#09090b"><strong style="font-size:22px">Apex Bookings</strong></header><section style="padding:28px"><h1 style="font-size:22px;margin:0 0 16px;color:#fafafa">${escape(job.subject)}</h1><table style="width:100%;font-size:14px">${fields}</table>${actionUrl ? `<a href="${escape(actionUrl)}" style="display:inline-block;margin-top:24px;padding:13px 18px;border-radius:12px;background:#00ff88;color:#09090b;text-decoration:none;font-weight:700">${escape(actionLabel)}</a>` : ''}</section><footer style="padding:18px 28px;background:#18181b;color:#a1a1aa;font-size:12px">Apex Bookings · Secure event booking</footer></main></body></html>`
}

async function isAdmin(request: Request, admin: ReturnType<typeof createClient>) {
  const authorization = request.headers.get('Authorization')
  if (!authorization) return false
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data } = await admin.auth.getUser(token)
  return data.user?.email === 'apexbookings001@gmail.com'
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Server configuration is incomplete' }, 500)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  if (!await isAdmin(request, admin)) return json({ error: 'Unauthorized' }, 401)

  const payload = await request.json().catch(() => null) as { action?: string; emailId?: string } | null
  if (payload?.action !== 'send-email' || !payload.emailId) return json({ error: 'Invalid request' }, 400)

  const { data: job, error } = await admin.from('email_queue').select('id,recipient,subject,payload').eq('id', payload.emailId).eq('status', 'queued').single()
  if (error || !job) return json({ error: 'Email job was not found or is no longer queued' }, 404)

  await admin.from('email_queue').update({ status: 'processing' }).eq('id', job.id)
  const smtpUser = Deno.env.get('GMAIL_SMTP_USER')
  const smtpPassword = Deno.env.get('GMAIL_SMTP_APP_PASSWORD')
  if (!smtpUser || !smtpPassword) {
    await admin.from('email_queue').update({ status: 'failed', error: 'Gmail SMTP secrets are not configured' }).eq('id', job.id)
    return json({ error: 'Gmail SMTP secrets are not configured' }, 503)
  }

  try {
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPassword } })
    const email = job as EmailJob
    await transport.sendMail({ from: `Apex Bookings <${smtpUser}>`, to: email.recipient, subject: email.subject, html: renderEmail(email) })
    await admin.from('email_queue').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', job.id)
    return json({ ok: true })
  } catch (mailError) {
    await admin.from('email_queue').update({ status: 'failed', error: mailError instanceof Error ? mailError.message : 'SMTP delivery failed' }).eq('id', job.id)
    return json({ error: 'SMTP delivery failed' }, 502)
  }
})

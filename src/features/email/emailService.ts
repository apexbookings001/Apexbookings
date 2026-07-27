export type EmailStatus = 'connected' | 'disconnected' | 'configuration_error' | 'invalid_credentials'
export type EmailKind = 'booking_started' | 'payment_proof_submitted' | 'payment_approved' | 'payment_declined' | 'bank_transfer_requested' | 'bank_details_ready' | 'transfer_expired' | 'support_reply' | 'ticket_ready' | 'welcome' | 'test'

export type EmailConfiguration = {
  provider: 'gmail_smtp'
  host: string
  port: number
  senderEmail: string
  senderName: string
  replyTo: string
  testRecipient: string
  status: EmailStatus
}

export type EmailEvent = { kind: EmailKind; to: string; subject: string; data: Record<string, string>; deepLink?: string }
export type EmailLog = EmailEvent & { id: string; createdAt: string; state: 'queued' | 'sent' | 'failed' }

const configKey = 'apex.email.configuration'
const outboxKey = 'apex.email.outbox'
const eventName = 'apex:email'
const fallback: EmailConfiguration = { provider: 'gmail_smtp', host: 'smtp.gmail.com', port: 587, senderEmail: '', senderName: 'Apex Bookings', replyTo: '', testRecipient: '', status: 'disconnected' }

const read = <T,>(key: string, value: T): T => { try { return { ...value, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return value } }
const write = (key: string, value: unknown) => { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event(eventName)) }

async function enqueueRemote(event: EmailEvent): Promise<void> {
  if (!supabase) return
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return
  const { data: organizationId, error: organizationError } = await supabase.rpc('bootstrap_admin_workspace')
  if (organizationError || !organizationId) return
  const { data: job, error } = await supabase.from('email_queue').insert({ organization_id: organizationId, kind: event.kind, recipient: event.to, subject: event.subject, payload: { ...event.data, actionUrl: event.deepLink } }).select('id').single()
  if (error || !job) return
  await supabase.functions.invoke('app-api', { body: { action: 'send-email', emailId: job.id } })
}

export const emailTemplates = {
  render: (event: EmailEvent) => `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#171a1f"><main style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #e1e5ea;border-radius:20px;overflow:hidden"><header style="padding:24px;background:#155eef;color:#fff"><strong style="font-size:20px">Apex Bookings</strong></header><section style="padding:28px"><h1 style="font-size:22px;margin:0 0 14px">${event.subject}</h1><table style="width:100%;font-size:14px;color:#5f6773">${Object.entries(event.data).map(([label, value]) => `<tr><td style="padding:7px 0">${label}</td><td style="padding:7px 0;text-align:right;color:#171a1f;font-weight:600">${value}</td></tr>`).join('')}</table>${event.deepLink ? `<a href="${event.deepLink}" style="display:inline-block;margin-top:22px;padding:12px 18px;border-radius:10px;background:#155eef;color:#fff;text-decoration:none;font-weight:700">Open in Apex Bookings</a>` : ''}</section><footer style="padding:18px 28px;background:#f7f8fa;color:#87909d;font-size:12px">Apex Bookings · Please do not reply to this automated notification.</footer></main></body></html>`,
}

export const emailService = {
  configuration: (): EmailConfiguration => read(configKey, fallback),
  saveConfiguration: (change: Partial<EmailConfiguration>) => write(configKey, { ...emailService.configuration(), ...change }),
  logs: (): EmailLog[] => { try { return JSON.parse(localStorage.getItem(outboxKey) ?? '[]') as EmailLog[] } catch { return [] } },
  subscribe: (listener: () => void) => { window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener) },
  validate: () => {
    const config = emailService.configuration()
    const status: EmailStatus = config.host === 'smtp.gmail.com' && config.port > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.senderEmail) ? 'connected' : 'configuration_error'
    emailService.saveConfiguration({ status })
    return status
  },
  dispatch: (event: EmailEvent) => {
    const config = emailService.configuration()
    const log: EmailLog = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: config.status === 'connected' ? 'queued' : 'failed' }
    write(outboxKey, [log, ...emailService.logs()])
    // Delivery is delegated to the server-only Edge Function. SMTP credentials never enter browser code.
    if (config.status === 'connected') void enqueueRemote(event).catch(() => undefined)
    return log
  },
}
import { supabase } from '../../lib/supabase'

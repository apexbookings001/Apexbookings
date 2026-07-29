import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type EmailStatus = 'connected' | 'disconnected' | 'configuration_error' | 'invalid_credentials'
export type EmailKind = 'booking_started' | 'payment_proof_submitted' | 'payment_approved' | 'payment_declined' | 'bank_transfer_requested' | 'bank_details_ready' | 'transfer_expired' | 'support_contact' | 'support_reply' | 'ticket_ready' | 'welcome' | 'test'
export type EmailConfiguration = { provider: 'gmail_smtp'; host: string; port: number; senderEmail: string; senderName: string; replyTo: string; testRecipient: string; status: EmailStatus }
export type EmailEvent = { kind: EmailKind; to: string; subject: string; data: Record<string, string>; deepLink?: string; actionLabel?: string }
export type EmailLog = EmailEvent & { id: string; createdAt: string; state: 'queued' | 'sent' | 'failed' }

type EmailState = { configuration: EmailConfiguration; logs: EmailLog[] }
const fallback: EmailConfiguration = { provider: 'gmail_smtp', host: 'smtp.gmail.com', port: 465, senderEmail: '', senderName: 'Apex Bookings', replyTo: '', testRecipient: '', status: 'disconnected' }
const cache = createProtectedMemoryStore<EmailState>(() => ({ configuration: fallback, logs: [] }))

async function persistConfiguration(configuration: EmailConfiguration) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('settings').upsert({ organization_id: requireOrganizationId(), email_template: { configuration } }, { onConflict: 'organization_id' })
  if (error) throw error
}

async function enqueueRemote(event: EmailEvent): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: job, error } = await supabase.from('email_queue').insert({ organization_id: requireOrganizationId(), kind: event.kind, recipient: event.to, subject: event.subject, payload: { ...event.data, actionUrl: event.deepLink, actionLabel: event.actionLabel } }).select('id').single()
  if (error || !job) throw error ?? new Error('Email could not be queued.')
  const delivery = await supabase.functions.invoke('app-api', { body: { action: 'send-email', emailId: job.id } })
  if (delivery.error) throw delivery.error
  return job.id
}

export const emailTemplates = {
  render: (event: EmailEvent) => `<!doctype html><html><body style="margin:0;background:#09090b;font-family:Arial,sans-serif;color:#fafafa"><main style="max-width:600px;margin:24px auto;background:#111113;border:1px solid #27272a;border-radius:20px;overflow:hidden"><header style="padding:16px;text-align:center;background:#030303"><img src="/apex-email-ticket-logo.png" alt="Apex Bookings" width="170" height="96" style="object-fit:cover"/></header><section style="padding:28px"><h1>${event.subject}</h1>${event.deepLink ? `<a href="${event.deepLink}">Open in Apex Bookings</a>` : ''}</section></main></body></html>`,
}

export const emailService = {
  configuration: () => cache.get().configuration,
  logs: () => cache.get().logs,
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const organizationId = requireOrganizationId()
      const [settingsResult, logsResult] = await Promise.all([
        supabase.from('settings').select('email_template').eq('organization_id', organizationId).single(),
        supabase.from('email_queue').select('id,kind,recipient,subject,payload,status,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100),
      ])
      if (settingsResult.error) throw settingsResult.error
      if (logsResult.error) throw logsResult.error
      const template = (settingsResult.data.email_template ?? {}) as { configuration?: Partial<EmailConfiguration> }
      const configuration = { ...fallback, ...template.configuration }
      const logs = (logsResult.data ?? []).map(row => {
        const payload = (row.payload ?? {}) as Record<string, string>
        return { id: row.id, kind: row.kind as EmailKind, to: row.recipient, subject: row.subject, data: payload, deepLink: payload.actionUrl, actionLabel: payload.actionLabel, createdAt: row.created_at, state: row.status === 'sent' ? 'sent' as const : row.status === 'failed' ? 'failed' as const : 'queued' as const }
      })
      cache.set({ configuration, logs })
      return cache.get()
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  saveConfiguration: (change: Partial<EmailConfiguration>) => {
    const state = cache.get()
    const configuration = { ...state.configuration, ...change }
    void cache.optimistic({ ...state, configuration }, () => persistConfiguration(configuration)).catch(() => undefined)
  },
  validate: () => {
    const configuration = emailService.configuration()
    const status: EmailStatus = configuration.host === 'smtp.gmail.com' && configuration.port > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.senderEmail) ? 'connected' : 'configuration_error'
    emailService.saveConfiguration({ status })
    return status
  },
  dispatch: (event: EmailEvent) => {
    const log: EmailLog = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: 'queued' }
    const state = cache.get()
    void cache.optimistic({ ...state, logs: [log, ...state.logs] }, async () => {
      const id = await enqueueRemote(event)
      cache.set({ ...cache.get(), logs: cache.get().logs.map(item => item.id === log.id ? { ...item, id, state: 'sent' } : item) })
    }).catch(() => undefined)
    return log
  },
  sendTest: async (recipient: string): Promise<EmailLog> => {
    const event: EmailEvent = { kind: 'test', to: recipient.trim(), subject: 'Apex Bookings test email', data: { Status: 'SMTP delivery from the deployed app-api Edge Function is working.', SentAt: new Date().toISOString() } }
    const pending: EmailLog = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: 'queued' }
    cache.set({ ...cache.get(), logs: [pending, ...cache.get().logs] })
    try {
      const id = await enqueueRemote(event)
      const sent = { ...pending, id, state: 'sent' as const }
      cache.set({ ...cache.get(), logs: cache.get().logs.map(item => item.id === pending.id ? sent : item) })
      return sent
    } catch (error) {
      cache.set({ ...cache.get(), logs: cache.get().logs.map(item => item.id === pending.id ? { ...item, state: 'failed' as const } : item) })
      throw new Error(error instanceof Error && error.message ? error.message : 'The test email could not be delivered.')
    }
  },
  dispatchAdmin: async (eventId: string, event: Omit<EmailEvent, 'to'>) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const client = supabase
    const { data, error } = await client.rpc('queue_public_admin_email', { target_event_id: eventId, email_payload: event })
    if (error) throw error
    const emailIds = Array.isArray(data) ? data.map(String) : data ? [String(data)] : []
    if (!emailIds.length) throw new Error('No administrator email recipients are configured for this event.')
    await Promise.all(emailIds.map(async emailId => {
      const delivery = await client.functions.invoke('app-api', { body: { action: 'send-public-admin-email', emailId } })
      if (delivery.error) throw delivery.error
    }))
  },
  clear: cache.reset,
}

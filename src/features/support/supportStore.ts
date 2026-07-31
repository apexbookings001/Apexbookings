import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { getWorkspaceMembership, requireOrganizationId } from '../../services/supabase/workspace'
import { uploadChatAttachment } from '../../services/supabase/chatMediaRepository'

export type SupportStatus = 'open' | 'pending' | 'resolved' | 'closed'
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'emoji'
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type AttachmentMeta = { name: string; size: number; mimeType: string; url: string; thumbnail?: string; duration?: number; width?: number; height?: number; file?: Blob }
export type ReplyRef = { messageId: string; body: string; from: 'customer' | 'admin'; type: MessageType; attachmentUrl?: string }
export type SupportMessage = { id: string; type: MessageType; body: string; from: 'customer' | 'admin'; createdAt: string; readAt?: string; status: MessageStatus; internal?: boolean; attachment?: AttachmentMeta; replyTo?: ReplyRef; reactions?: string[] }
export type ConversationDraft = { text: string; replyTo?: ReplyRef; attachments: AttachmentMeta[]; scrollPosition?: number }
export type SupportConversation = {
  id: string; eventId: string; customer: string; email: string; avatar?: string; avatarColor?: string; status: SupportStatus; unread: number; notes: string; messages: SupportMessage[]; updatedAt: string; bookingRef?: string; eventName?: string; packageName?: string; seatNumber?: string; paymentStatus?: string; createdAt: string; lastActivity: string; accessToken?: string
}

const DRAFT_KEY = 'apex.support-drafts'
const AVATAR_COLORS = ['#00FF88', '#8B5CF6', '#F59E0B', '#22D3EE', '#F472B6', '#EF4444', '#3B82F6']
const cache = createProtectedMemoryStore<SupportConversation[]>(() => [])
const openingConversations = new Map<string, Promise<SupportConversation>>()
let adminRealtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let publicRealtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

function readDrafts(): Record<string, ConversationDraft> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Record<string, ConversationDraft> } catch { return {} }
}
function writeDrafts(drafts: Record<string, ConversationDraft>) { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)) }
function colorForEmail(email: string) { let hash = 0; for (const character of email) hash = (hash * 31 + character.charCodeAt(0)) | 0; return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] }

function messageFromSnapshot(row: Record<string, unknown>): SupportMessage {
  return {
    id: String(row.id),
    type: String(row.type ?? row.message_type ?? 'text') as MessageType,
    body: String(row.body ?? ''),
    from: String(row.from ?? (row.sender_type === 'customer' ? 'customer' : 'admin')) as 'customer' | 'admin',
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    readAt: row.readAt || row.read_at ? String(row.readAt ?? row.read_at) : undefined,
    status: String(row.status ?? (row.read_at ? 'read' : row.delivered_at ? 'delivered' : 'sent')) as MessageStatus,
    internal: Boolean(row.internal),
    attachment: row.attachment && typeof row.attachment === 'object' ? row.attachment as AttachmentMeta : undefined,
    replyTo: row.replyTo && typeof row.replyTo === 'object' ? row.replyTo as ReplyRef : undefined,
    reactions: Array.isArray(row.reactions) ? row.reactions.map(String) : undefined,
  }
}

function conversationFromSnapshot(snapshot: Record<string, unknown>): SupportConversation {
  const row = (snapshot.conversation ?? snapshot) as Record<string, unknown>
  const messages = ((snapshot.messages ?? row.messages) as Record<string, unknown>[] | undefined ?? []).map(messageFromSnapshot)
  const email = String(row.email ?? '')
  return {
    id: String(row.id),
    eventId: String(row.eventId ?? row.event_id ?? ''),
    customer: String(row.customer ?? ''),
    email,
    avatarColor: colorForEmail(email),
    status: String(row.status ?? 'open') as SupportStatus,
    unread: messages.filter(message => message.from === 'customer' && message.status !== 'read').length,
    notes: String(row.notes ?? ''),
    messages,
    updatedAt: String(row.updatedAt ?? row.updated_at ?? new Date().toISOString()),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    lastActivity: String(row.lastActivity ?? row.last_activity_at ?? new Date().toISOString()),
    accessToken: row.accessToken ? String(row.accessToken) : row.access_token ? String(row.access_token) : undefined,
    bookingRef: row.bookingRef ? String(row.bookingRef) : undefined,
    eventName: row.eventName ? String(row.eventName) : undefined,
    packageName: row.packageName ? String(row.packageName) : undefined,
    seatNumber: row.seatNumber ? String(row.seatNumber) : undefined,
    paymentStatus: row.paymentStatus ? String(row.paymentStatus) : undefined,
  }
}

async function persistConversation(conversation: SupportConversation) {
  if (!supabase) throw new Error('Supabase is not configured.')
  requireOrganizationId()
  const { error } = await supabase.from('support_conversations').update({ status: conversation.status, notes: conversation.notes, last_activity_at: conversation.lastActivity }).eq('id', conversation.id)
  if (error) throw error
}

export const supportStore = {
  list: () => cache.get(),
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const organizationId = requireOrganizationId()
      const { data: conversations, error } = await supabase.from('support_conversations').select('id,event_id,status,notes,last_activity_at,created_at,updated_at,access_token,customers!inner(full_name,email),events(name),bookings(reference,payment_state,metadata)').eq('organization_id', organizationId).is('deleted_at', null).order('last_activity_at', { ascending: false })
      if (error) throw error
      const ids = (conversations ?? []).map(row => row.id)
      const messagesResult = ids.length ? await supabase.from('chat_messages').select('*').in('conversation_id', ids).is('deleted_at', null).order('created_at') : { data: [], error: null }
      if (messagesResult.error) throw messagesResult.error
      const messagesByConversation = new Map<string, SupportMessage[]>()
      for (const row of messagesResult.data ?? []) {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>
        const messages = messagesByConversation.get(row.conversation_id) ?? []
        messages.push(messageFromSnapshot({ ...row, ...metadata }))
        messagesByConversation.set(row.conversation_id, messages)
      }
      const result = (conversations ?? []).map(row => {
        const customer = row.customers as unknown as { full_name: string; email: string }
        const event = row.events as unknown as { name?: string } | null
        const booking = row.bookings as unknown as { reference?: string; payment_state?: string; metadata?: Record<string, unknown> } | null
        return conversationFromSnapshot({ conversation: { ...row, eventId: row.event_id, customer: customer.full_name, email: customer.email, eventName: event?.name, bookingRef: booking?.reference, paymentStatus: booking?.payment_state, packageName: booking?.metadata?.packageName, seatNumber: booking?.metadata?.seatLabel }, messages: messagesByConversation.get(row.id) ?? [] })
      })
      cache.set(result)
      return result
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  getOrCreate: async (eventId: string, email: string, customer = 'Event Guest') => {
    const normalizedEmail = email.trim().toLowerCase()
    const existing = cache.get().find(conversation => conversation.eventId === eventId && conversation.email === normalizedEmail)
    if (existing) return existing
    if (!supabase) throw new Error('Supabase is not configured.')
    const key = `${eventId}:${normalizedEmail}`
    const inFlight = openingConversations.get(key)
    if (inFlight) return inFlight
    const request = (async () => {
      const args = { target_event_id: eventId, customer_email: normalizedEmail, customer_name: customer }
      const { data, error } = await supabase.rpc('open_public_support_conversation', args)
      if (error) {
        if (import.meta.env.DEV) console.warn('[support] open_public_support_conversation failed', { code: error.code, message: error.message, details: error.details, hint: error.hint, args: { eventId, hasEmail: Boolean(normalizedEmail), hasCustomer: Boolean(customer) } })
        throw error
      }
      const conversation = conversationFromSnapshot(data as Record<string, unknown>)
      cache.set([conversation, ...cache.get().filter(item => item.id !== conversation.id)])
      return conversation
    })()
    openingConversations.set(key, request)
    try { return await request } finally { openingConversations.delete(key) }
  },
  refreshPublic: async (conversation: SupportConversation) => {
    if (!supabase || !conversation.accessToken) return conversation
    const { data, error } = await supabase.rpc('public_support_snapshot', { conversation_access_token: conversation.accessToken })
    if (error) throw error
    const refreshed = conversationFromSnapshot(data as Record<string, unknown>)
    cache.set([refreshed, ...cache.get().filter(item => item.id !== refreshed.id)])
    return refreshed
  },
  update: (conversation: SupportConversation) => {
    const updated = { ...conversation, lastActivity: new Date().toISOString() }
    const next = cache.get().map(item => item.id === updated.id ? updated : item)
    if (getWorkspaceMembership()) void cache.optimistic(next, () => persistConversation(updated)).catch(() => undefined)
    else cache.set(next)
  },
  send: (id: string, payload: { type?: MessageType; body: string; from: 'customer' | 'admin'; attachment?: AttachmentMeta; replyTo?: ReplyRef }) => {
    const conversation = cache.get().find(item => item.id === id)
    if (!conversation) return
    const message: SupportMessage = { id: crypto.randomUUID(), type: payload.type ?? 'text', body: payload.body, from: payload.from, createdAt: new Date().toISOString(), status: 'sending', attachment: payload.attachment, replyTo: payload.replyTo }
    const updated = { ...conversation, unread: payload.from === 'customer' ? conversation.unread + 1 : 0, updatedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), messages: [...conversation.messages, message] }
    cache.set(cache.get().map(item => item.id === id ? updated : item))
    void (async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const attachment = payload.attachment ? await uploadChatAttachment(conversation, payload.attachment) : undefined
      const remotePayload = { ...payload, attachment }
      let saved: Record<string, unknown> | null = null
      if (payload.from === 'customer') {
        if (!conversation.accessToken) throw new Error('This support conversation is not authorized.')
        const { data, error } = await supabase.rpc('send_public_support_message', { conversation_access_token: conversation.accessToken, message_payload: remotePayload })
        if (error) throw error
        saved = data as Record<string, unknown>
      } else {
        const { data, error } = await supabase.from('chat_messages').insert({ conversation_id: id, sender_type: 'admin', sender_user_id: getWorkspaceMembership()?.userId, body: payload.body, message_type: payload.type ?? 'text', delivered_at: new Date().toISOString(), metadata: { attachment, replyTo: payload.replyTo } }).select().single()
        if (error) throw error
        saved = data as Record<string, unknown>
        await supabase.from('support_conversations').update({ last_activity_at: new Date().toISOString() }).eq('id', id)
      }
      const current = cache.get().find(item => item.id === id)
      if (!saved?.id || !saved.conversation_id || !saved.sender_type) throw new Error('The saved support message was incomplete.')
      const confirmed = messageFromSnapshot({ ...saved, ...((saved.metadata as Record<string, unknown> | null) ?? {}) })
      if (current) cache.set(cache.get().map(item => item.id === id ? { ...current, lastActivity: confirmed.createdAt, messages: current.messages.map(item => item.id === message.id ? { ...confirmed, attachment, status: 'sent' } : item) } : item))
    })().catch(error => {
      const current = cache.get().find(item => item.id === id)
      if (current) cache.set(cache.get().map(item => item.id === id ? { ...current, messages: current.messages.map(item => item.id === message.id ? { ...item, status: 'failed' } : item) } : item))
      cache.fail(error)
    })
    return message
  },
  markRead: (id: string) => {
    const conversation = cache.get().find(item => item.id === id)
    if (!conversation) return
    const now = new Date().toISOString()
    const updated = { ...conversation, unread: 0, messages: conversation.messages.map(message => message.status !== 'read' ? { ...message, status: 'read' as MessageStatus, readAt: now } : message) }
    cache.set(cache.get().map(item => item.id === id ? updated : item))
    if (!supabase) return
    if (getWorkspaceMembership()) void supabase.from('chat_messages').update({ read_at: now }).eq('conversation_id', id).eq('sender_type', 'customer').is('read_at', null)
    else if (conversation.accessToken) void supabase.rpc('mark_public_support_read', { conversation_access_token: conversation.accessToken })
  },
  getDraft: (id: string) => readDrafts()[id] ?? { text: '', attachments: [] },
  saveDraft: (id: string, draft: ConversationDraft) => { const drafts = readDrafts(); drafts[id] = draft; writeDrafts(drafts) },
  clearDraft: (id: string) => { const drafts = readDrafts(); delete drafts[id]; writeDrafts(drafts) },
  colorForEmail,
  clear: cache.reset,
  startAdminRealtime: (organizationId: string) => {
    if (!supabase) return () => undefined
    if (adminRealtimeChannel) void supabase.removeChannel(adminRealtimeChannel)
    adminRealtimeChannel = supabase.channel(`support-admin:${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations', filter: `organization_id=eq.${organizationId}` }, () => { void supportStore.hydrate().catch(() => undefined) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => { void supportStore.hydrate().catch(() => undefined) })
      .subscribe()
    return () => { if (adminRealtimeChannel) { void supabase.removeChannel(adminRealtimeChannel); adminRealtimeChannel = null } }
  },
  startPublicRealtime: (conversation: SupportConversation) => {
    if (!supabase || !conversation.accessToken) return () => undefined
    if (publicRealtimeChannel) void supabase.removeChannel(publicRealtimeChannel)
    publicRealtimeChannel = supabase.channel(`support-public:${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversation.id}` }, () => { void supportStore.refreshPublic(conversation).catch(() => undefined) })
      .subscribe()
    return () => { if (publicRealtimeChannel) { void supabase.removeChannel(publicRealtimeChannel); publicRealtimeChannel = null } }
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type SupportStatus = 'open' | 'pending' | 'resolved' | 'closed'

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'emoji'

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export type AttachmentMeta = {
  name: string
  size: number
  mimeType: string
  url: string
  thumbnail?: string
  duration?: number  // seconds, for audio/video/voice
  width?: number
  height?: number
}

export type ReplyRef = {
  messageId: string
  body: string
  from: 'customer' | 'admin'
  type: MessageType
  attachmentUrl?: string
}

export type SupportMessage = {
  id: string
  type: MessageType
  body: string
  from: 'customer' | 'admin'
  createdAt: string
  readAt?: string
  status: MessageStatus
  internal?: boolean
  attachment?: AttachmentMeta
  replyTo?: ReplyRef
  reactions?: string[]
}

export type ConversationDraft = {
  text: string
  replyTo?: ReplyRef
  attachments: AttachmentMeta[]
  scrollPosition?: number
}

export type SupportConversation = {
  id: string
  eventId: string
  customer: string
  email: string
  avatar?: string
  avatarColor?: string
  status: SupportStatus
  unread: number
  notes: string
  messages: SupportMessage[]
  updatedAt: string
  // Customer/booking info for admin panel
  bookingRef?: string
  eventName?: string
  packageName?: string
  seatNumber?: string
  paymentStatus?: string
  createdAt: string
  lastActivity: string
}

// ─── Draft persistence ────────────────────────────────────────────────────────
const DRAFT_KEY = 'apex.support-drafts'

function readDrafts(): Record<string, ConversationDraft> {
  try {
    const v = localStorage.getItem(DRAFT_KEY)
    return v ? (JSON.parse(v) as Record<string, ConversationDraft>) : {}
  } catch {
    return {}
  }
}

function writeDraft(id: string, draft: ConversationDraft) {
  const drafts = readDrafts()
  drafts[id] = draft
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
}

function clearDraft(id: string) {
  const drafts = readDrafts()
  delete drafts[id]
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
}

// ─── Conversation store ───────────────────────────────────────────────────────
const KEY = 'apex.support-conversations'
const EVENT_NAME = 'apex-support-update'

const AVATAR_COLORS = [
  '#00FF88', '#8B5CF6', '#F59E0B', '#22D3EE', '#F472B6', '#EF4444', '#3B82F6',
]

function colorForEmail(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function read(): SupportConversation[] {
  try {
    const v = localStorage.getItem(KEY)
    return v ? (JSON.parse(v) as SupportConversation[]) : []
  } catch {
    return []
  }
}

function write(items: SupportConversation[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(EVENT_NAME))
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const supportStore = {
  list: (): SupportConversation[] => read(),

  subscribe: (listener: () => void) => {
    window.addEventListener(EVENT_NAME, listener)
    return () => window.removeEventListener(EVENT_NAME, listener)
  },

  getOrCreate: (eventId: string, email = 'guest@apexbookings.local', customer = 'Event Guest'): SupportConversation => {
    const found = read().find(c => c.eventId === eventId && c.email === email)
    if (found) return found
    const now = new Date().toISOString()
    const conversation: SupportConversation = {
      id: crypto.randomUUID(),
      eventId,
      customer,
      email,
      avatarColor: colorForEmail(email),
      status: 'open',
      unread: 0,
      notes: '',
      messages: [],
      updatedAt: now,
      createdAt: now,
      lastActivity: now,
    }
    write([conversation, ...read()])
    return conversation
  },

  update: (conversation: SupportConversation) => {
    write(read().map(c => (c.id === conversation.id ? { ...conversation, lastActivity: new Date().toISOString() } : c)))
  },

  send: (id: string, payload: {
    type?: MessageType
    body: string
    from: 'customer' | 'admin'
    attachment?: AttachmentMeta
    replyTo?: ReplyRef
  }) => {
    const conversation = read().find(c => c.id === id)
    if (!conversation) return
    const message: SupportMessage = {
      id: crypto.randomUUID(),
      type: payload.type ?? 'text',
      body: payload.body,
      from: payload.from,
      createdAt: new Date().toISOString(),
      status: 'sent',
      attachment: payload.attachment,
      replyTo: payload.replyTo,
    }
    const next: SupportConversation = {
      ...conversation,
      unread: payload.from === 'customer' ? conversation.unread + 1 : 0,
      updatedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messages: [...conversation.messages, message],
    }
    supportStore.update(next)
    return message
  },

  markRead: (id: string) => {
    const conversation = read().find(c => c.id === id)
    if (!conversation) return
    const now = new Date().toISOString()
    const updated: SupportConversation = {
      ...conversation,
      unread: 0,
      messages: conversation.messages.map(m =>
        m.from === 'customer' && m.status !== 'read'
          ? { ...m, status: 'read' as MessageStatus, readAt: now }
          : m
      ),
    }
    supportStore.update(updated)
  },

  getDraft: (id: string): ConversationDraft => {
    return readDrafts()[id] ?? { text: '', attachments: [] }
  },

  saveDraft: (id: string, draft: ConversationDraft) => {
    writeDraft(id, draft)
  },

  clearDraft: (id: string) => {
    clearDraft(id)
  },

  colorForEmail,
}

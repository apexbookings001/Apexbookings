// ─── Ticket Store ─────────────────────────────────────────────────────────────
// Stores confirmed and pending ticket records. Each ticket has a UUID (used as
// the QR verification path) and a human-readable ticket number for display.

export type TicketRecord = {
  id: string              // UUID → used in QR code URL /ticket/:id
  ticketNumber: string    // Pretty display e.g. TKT-ABCD-1234
  bookingReference: string // e.g. APEX-ABC123
  eventId: string
  eventName: string
  eventBanner: string
  eventDate: string
  eventTime: string
  eventVenue: string
  eventHost: string
  customerName: string
  customerEmail: string
  packageName: string
  packageAccent: string
  seatLabel: string
  benefits: string[]
  amount: number
  paymentMethod: string
  status: 'pending' | 'approved' | 'declined'
  declineReason?: string
  createdAt: string
  approvedAt?: string
}

const KEY = 'apex.tickets.v2'
const EVENT_NAME = 'apex:tickets'

const read = (): TicketRecord[] => {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as TicketRecord[]) : []
  } catch {
    return []
  }
}

const write = (records: TicketRecord[]) => {
  localStorage.setItem(KEY, JSON.stringify(records))
  window.dispatchEvent(new Event(EVENT_NAME))
}

function genTicketNumber(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TKT-${seg()}-${seg()}`
}

export const ticketStore = {
  list: (): TicketRecord[] => read(),
  subscribe: (listener: () => void) => { window.addEventListener(EVENT_NAME, listener); return () => window.removeEventListener(EVENT_NAME, listener) },

  findById: (id: string): TicketRecord | null =>
    read().find(t => t.id === id) ?? null,

  findByTicketNumber: (tn: string): TicketRecord | null =>
    read().find(t => t.ticketNumber === tn) ?? null,

  findByReference: (ref: string): TicketRecord | null =>
    read().find(t => t.bookingReference === ref) ?? null,

  create: (input: Omit<TicketRecord, 'id' | 'ticketNumber' | 'createdAt'>): TicketRecord => {
    const record: TicketRecord = {
      ...input,
      id: crypto.randomUUID(),
      ticketNumber: genTicketNumber(),
      createdAt: new Date().toISOString(),
    }
    write([record, ...read()])
    return record
  },

  approve: (id: string): void => {
    write(
      read().map(t =>
        t.id === id
          ? { ...t, status: 'approved' as const, approvedAt: new Date().toISOString() }
          : t
      )
    )
  },

  decline: (id: string, reason = ''): void => {
    write(
      read().map(t =>
        t.id === id ? { ...t, status: 'declined' as const, declineReason: reason } : t
      )
    )
  },
}

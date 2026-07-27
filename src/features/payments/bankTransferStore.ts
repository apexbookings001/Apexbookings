import type { PaymentMethod } from '../../types/domain'

export type BankTransferStatus =
  | 'waiting_for_bank_details'
  | 'bank_details_ready'
  | 'transfer_window_active'
  | 'payment_proof_submitted'
  | 'awaiting_approval'
  | 'approved'
  | 'declined'
  | 'expired'
  | 'cancelled'

export type BankTransferDetails = {
  bankName: string
  accountHolder: string
  accountNumber: string
  routingNumber?: string
  referenceNumber?: string
  expiresAt?: string
}

export type BankTransferRequest = {
  id: string
  bookingId: string
  eventId: string
  eventName: string
  customerName: string
  customerEmail: string
  country: string
  currency: string
  packageName: string
  seatLabel: string
  totalAmount: number
  createdAt: string
  status: BankTransferStatus
  paymentMethod: PaymentMethod
  details?: BankTransferDetails
}

const STORAGE_KEY = 'apex.bank-transfer-requests.v1'
const EVENT_NAME = 'apex:bank-transfer-requests'

const read = (): BankTransferRequest[] => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) as BankTransferRequest[] : []
  } catch {
    return []
  }
}

const write = (records: BankTransferRequest[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); window.dispatchEvent(new Event(EVENT_NAME)) } catch { /* storage unavailable */ }
}

export const bankTransferStore = {
  list: (): BankTransferRequest[] => read(),
  subscribe: (listener: () => void) => { window.addEventListener(EVENT_NAME, listener); return () => window.removeEventListener(EVENT_NAME, listener) },
  find: (id: string | null | undefined): BankTransferRequest | null => id ? read().find(record => record.id === id) ?? null : null,
  create: (input: Omit<BankTransferRequest, 'id' | 'createdAt' | 'status' | 'paymentMethod'>): BankTransferRequest => {
    const id = `BTR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const request: BankTransferRequest = { ...input, id, createdAt: new Date().toISOString(), status: 'waiting_for_bank_details', paymentMethod: 'bank_transfer' }
    write([request, ...read()])
    return request
  },
  update: (id: string, change: Partial<Omit<BankTransferRequest, 'id' | 'createdAt'>>): BankTransferRequest | null => {
    let updated: BankTransferRequest | null = null
    const records = read().map(record => {
      if (record.id !== id) return record
      updated = { ...record, ...change }
      return updated
    })
    write(records)
    return updated
  },
  markReady: (id: string, details?: BankTransferDetails): BankTransferRequest | null => {
    const current = bankTransferStore.find(id)
    if (!current || !details) return current
    return bankTransferStore.update(id, { status: 'bank_details_ready', details: { ...details, expiresAt: details.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString() } })
  },
}

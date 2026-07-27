import type { EventStatus, PaymentMethod, SeatStatus, CryptoCoinConfig } from '../../types/domain'
import type { BookingPageData } from './bookingTemplate'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type TimelineItem = { id: string; time: string; title: string; description: string }
export type Testimonial = { id: string; name: string; photo: string; review: string; rating: number }
export type FaqItem = { id: string; question: string; answer: string }
export type TicketPackage = { id: string; name: string; price: number; description: string; benefits: string[]; color?: string; capacity: number }
export type StudioSeat = { id: string; number: number; packageId: string; status: SeatStatus }
export type EventPaymentMethod = { enabled: boolean; hidden?: boolean; order?: number; instructions: string; destination?: string; qrCode?: string }
export type EventPricingSettings = { serviceFee: number; taxPercentage: number }
export type EventPaymentSettings = { usePlatformDefaults: boolean; defaultMethod: PaymentMethod; methods: Record<PaymentMethod, EventPaymentMethod>; cryptocurrencies: Record<string, CryptoCoinConfig>; pricing: EventPricingSettings }
export type EventPublication = { slug: string; shortCode: string; publishedAt?: string; scheduledFor?: string; archivedAt?: string }
export type EventContent = {
  hero: { title: string; subtitle: string; date: string; venue: string; hostName: string; ctaText: string; ctaLink: string; images: string[] }
  about: { title: string; description: string; image: string }
  venue: { name: string; address: string; mapLink: string }
  timeline: TimelineItem[]
  testimonials: Testimonial[]
  faq: FaqItem[]
  cta: { heading: string; description: string; buttonText: string; buttonLink: string; background: string }
  footer: { logo: string; contact: string; socialLinks: string[]; copyright: string; text: string }
  sectionVisibility: Record<string, boolean>
}

export type EventSetup = { hostName: string; showType: string; startTime: string; endTime: string; mapLink: string; banners: string[]; paymentMethods: string[]; sectionContent: Record<string, string> }
export type ManagedEvent = {
  id: string; title: string; venue: string; date: string; banner?: string; sold: number; capacity: number; revenue: number; status: EventStatus
  schedule: { time: string; title: string; detail: string }[]; setup?: EventSetup
  bookingPage?: BookingPageData
  content?: EventContent; packages?: TicketPackage[]; seats?: StudioSeat[]; payments?: EventPaymentSettings; publication?: EventPublication
}

const id = () => crypto.randomUUID()
const image = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=900&fit=crop&auto=format'
const capacitySplit = (capacity: number) => [Math.floor(capacity / 2), Math.floor(capacity / 4), capacity - Math.floor(capacity / 2) - Math.floor(capacity / 4)]

export const createStudioContent = (input: { title: string; venue: string; date: string; hostName: string; mapLink: string; banners?: string[] }): EventContent => ({
  hero: { title: input.title, subtitle: `Join ${input.hostName} for an unforgettable live experience.`, date: input.date, venue: input.venue, hostName: input.hostName, ctaText: 'Book tickets', ctaLink: '#tickets', images: input.banners?.length ? input.banners : [image] },
  about: { title: 'An unforgettable night awaits', description: `Experience ${input.title} live at ${input.venue}. Every detail has been curated for a memorable evening.`, image: 'https://images.unsplash.com/photo-1501962679900-bea61483313b?w=900&h=600&fit=crop&auto=format' },
  venue: { name: input.venue, address: '', mapLink: input.mapLink },
  timeline: [{ id: id(), time: '6:00 PM', title: 'Doors open', description: 'Welcome, security check, and guest arrival.' }, { id: id(), time: '8:00 PM', title: 'Main event', description: `${input.title} begins.` }],
  testimonials: [{ id: id(), name: 'Apex Guest', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&auto=format', review: 'A brilliantly produced event from start to finish.', rating: 5 }],
  faq: [{ id: id(), question: 'How do I receive my ticket?', answer: 'Your ticket is delivered after your booking is confirmed.' }, { id: id(), question: 'Can I transfer my ticket?', answer: 'Contact the event organizer for transfer requests.' }],
  cta: { heading: 'Ready for the experience?', description: `Secure your place at ${input.title}.`, buttonText: 'Book tickets now', buttonLink: '#tickets', background: image },
  footer: { logo: 'Apex', contact: 'support@apexbookings.com', socialLinks: ['Instagram', 'X', 'Facebook'], copyright: `© ${new Date().getFullYear()} Apex Bookings. All rights reserved.`, text: 'Premium event experiences, beautifully booked.' },
  sectionVisibility: { hero: true, about: true, venue: true, timeline: true, tickets: true, testimonials: true, faq: true, cta: true, footer: true },
})

export const createDefaultPackages = (capacity: number): TicketPackage[] => {
  const [regular, vip, vvip] = capacitySplit(Math.max(0, capacity))
  return [
    { id: id(), name: 'Regular', price: 0, description: 'General event admission.', benefits: ['Event entry'], capacity: regular, color: '#71717A' },
    { id: id(), name: 'VIP', price: 0, description: 'Enhanced event experience.', benefits: ['Priority entry', 'VIP access'], capacity: vip, color: '#00FF88' },
    { id: id(), name: 'VVIP', price: 0, description: 'The complete premium experience.', benefits: ['Priority entry', 'Premium access'], capacity: vvip, color: '#F59E0B' },
  ]
}

export const PLATFORM_PAYMENT_DEFAULTS: EventPaymentSettings = {
  usePlatformDefaults: true,
  defaultMethod: 'apple_gift_card',
  pricing: { serviceFee: 5, taxPercentage: 10 },
  methods: {
    apple_gift_card: { enabled: true, instructions: 'Upload clear images of the front and back of your Apple Gift Card. Verification usually takes 10–20 minutes.' },
    paypal: { enabled: true, instructions: 'Send payment to the PayPal address below, then upload your payment confirmation.', destination: 'payments@apexbookings.com' },
    cryptocurrency: { enabled: true, instructions: 'Select a cryptocurrency below to view payment instructions and wallet address.' },
    cash_app: { enabled: true, instructions: 'Send payment to the Cash App tag below, then upload your confirmation.', destination: '$ApexBookings' },
    bank_transfer: { enabled: true, instructions: 'Temporary account details are prepared for each request and remain valid for 30 minutes after issue.' },
  },
  cryptocurrencies: {
    bitcoin: { enabled: true, address: 'bc1qapexbookingswallet', network: 'Bitcoin', label: 'Bitcoin (BTC)' },
    ethereum: { enabled: true, address: '0xApexBookingsWallet', network: 'ERC20', label: 'Ethereum (ETH)' },
    usdt: { enabled: true, address: '0xApexBookingsWallet', network: 'TRC20', label: 'USDT' },
    solana: { enabled: true, address: 'ApexBookingsWalletSOL', network: 'Solana', label: 'Solana (SOL)' },
    xrp: { enabled: true, address: 'rApexBookingsWallet', network: 'Ripple', label: 'XRP' },
    litecoin: { enabled: true, address: 'ltc1qapexbookingswallet', network: 'Litecoin', label: 'Litecoin (LTC)' },
    cardano: { enabled: true, address: 'addr1apexbookingswallet', network: 'Cardano', label: 'Cardano (ADA)' },
    doge: { enabled: true, address: 'DApexBookingsWallet', network: 'Dogecoin', label: 'Dogecoin (DOGE)' },
    avalanche: { enabled: true, address: '0xApexBookingsWallet', network: 'AVAX C-Chain', label: 'Avalanche (AVAX)' },
    chainlink: { enabled: true, address: '0xApexBookingsWallet', network: 'ERC20', label: 'Chainlink (LINK)' },
    polkadot: { enabled: true, address: '1ApexBookingsWallet', network: 'Polkadot', label: 'Polkadot (DOT)' },
    polygon: { enabled: true, address: '0xApexBookingsWallet', network: 'Polygon', label: 'Polygon (MATIC)' },
    tron: { enabled: true, address: 'TApexBookingsWallet', network: 'TRC20', label: 'Tron (TRX)' },
    'stellar-coin': { enabled: true, address: 'GApexBookingsWallet', network: 'Stellar', label: 'Stellar (XLM)' },
    monero: { enabled: true, address: '4ApexBookingsWallet', network: 'Monero', label: 'Monero (XMR)' },
    binance: { enabled: true, address: '0xApexBookingsWallet', network: 'BSC', label: 'Binance Coin (BNB)' },
  },
}

const paymentSettings = (settings?: EventPaymentSettings): EventPaymentSettings => {
  const defaults = JSON.parse(JSON.stringify(PLATFORM_PAYMENT_DEFAULTS)) as EventPaymentSettings
  if (!settings) return defaults
  return { ...defaults, ...settings, pricing: { ...defaults.pricing, ...settings.pricing }, methods: { ...defaults.methods, ...settings.methods }, cryptocurrencies: { ...defaults.cryptocurrencies, ...settings.cryptocurrencies } }
}
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event'
const shortCode = () => `ABX${Math.random().toString(36).slice(2, 7).toUpperCase()}`

export const generateSeats = (_eventId: string, packages: TicketPackage[], existing: StudioSeat[] = []): StudioSeat[] => {
  const byNumber = new Map(existing.map(seat => [seat.number, seat]))
  let number = 1
  return packages.flatMap(pkg => Array.from({ length: Math.max(0, pkg.capacity) }, () => {
    const previous = byNumber.get(number)
    const seat = { id: previous?.id ?? id(), number, packageId: pkg.id, status: previous?.status ?? 'available' as SeatStatus }
    number += 1
    return seat
  }))
}

export const ensureStudioEvent = (event: ManagedEvent): ManagedEvent => {
  const content = event.content ?? createStudioContent({ title: event.title, venue: event.venue, date: event.date, hostName: event.setup?.hostName ?? 'Your host', mapLink: event.setup?.mapLink ?? '', banners: event.setup?.banners })
  const packages = event.packages ?? createDefaultPackages(event.capacity)
  const seats = event.seats ?? generateSeats(event.id, packages)
  const publication = event.publication ?? { slug: slugify(event.title), shortCode: shortCode() }
  const scheduledNow = event.status === 'scheduled' && publication.scheduledFor && new Date(publication.scheduledFor).getTime() <= Date.now()
  return { ...event, status: scheduledNow ? 'published' : event.status, content, packages, seats, payments: paymentSettings(event.payments), publication: { ...publication, publishedAt: scheduledNow ? new Date().toISOString() : publication.publishedAt } }
}

const storageKey = 'apex.managed-events'
const eventName = 'apex:managed-events'
const read = (): ManagedEvent[] => { try { const value = localStorage.getItem(storageKey); return value ? (JSON.parse(value) as ManagedEvent[]).map(ensureStudioEvent) : [] } catch { return [] } }
const write = (events: ManagedEvent[]): void => { localStorage.setItem(storageKey, JSON.stringify(events)); window.dispatchEvent(new Event(eventName)) }

type EventRow = Record<string, unknown>

const dateForDatabase = (date: string) => {
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

const fromDatabase = (row: EventRow): ManagedEvent => {
  const stored = (row.studio && typeof row.studio === 'object' ? row.studio : {}) as Partial<ManagedEvent>
  return ensureStudioEvent({
    ...stored,
    id: String(row.id),
    title: String(row.name ?? stored.title ?? 'Untitled event'),
    venue: String(row.venue ?? stored.venue ?? ''),
    date: String(row.starts_at ?? stored.date ?? ''),
    banner: row.banner_path ? String(row.banner_path) : stored.banner,
    sold: Number(stored.sold ?? 0),
    capacity: Number(stored.capacity ?? 0),
    revenue: Number(stored.revenue ?? 0),
    status: row.status as EventStatus,
    schedule: stored.schedule ?? [],
    content: (row.content as EventContent | null) ?? stored.content,
    payments: (row.payment_settings as EventPaymentSettings | null) ?? stored.payments,
    publication: {
      ...(stored.publication ?? { slug: slugify(String(row.name ?? 'event')), shortCode: shortCode() }),
      slug: String((stored.publication?.slug ?? slugify(String(row.name ?? 'event')))),
      shortCode: String(row.short_code ?? stored.publication?.shortCode ?? shortCode()),
      publishedAt: row.published_at ? String(row.published_at) : stored.publication?.publishedAt,
      scheduledFor: row.scheduled_for ? String(row.scheduled_for) : stored.publication?.scheduledFor,
      archivedAt: row.archived_at ? String(row.archived_at) : stored.publication?.archivedAt,
    },
  })
}

async function organizationId(): Promise<string | null> {
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase.rpc('bootstrap_admin_workspace')
  if (error || !data) return null
  return String(data)
}

async function syncEvent(event: ManagedEvent): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const orgId = await organizationId()
  if (!orgId) return
  const prepared = ensureStudioEvent(event)
  const { error } = await supabase.from('events').upsert({
    id: prepared.id,
    organization_id: orgId,
    slug: prepared.publication?.slug ?? slugify(prepared.title),
    short_code: prepared.publication?.shortCode,
    name: prepared.title,
    venue: prepared.venue,
    starts_at: dateForDatabase(prepared.date),
    status: prepared.status,
    banner_path: prepared.banner,
    content: prepared.content ?? {},
    payment_settings: prepared.payments ?? {},
    scheduled_for: prepared.publication?.scheduledFor,
    published_at: prepared.publication?.publishedAt,
    archived_at: prepared.publication?.archivedAt,
    studio: prepared,
  }, { onConflict: 'id' })
  if (error) throw error
}

async function removeFromDatabase(eventId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const orgId = await organizationId()
  if (!orgId) return
  const { error } = await supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', eventId).eq('organization_id', orgId)
  if (error) throw error
}

export const adminEventStore = {
  list: (): ManagedEvent[] => read(),
  subscribe: (listener: () => void) => { window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener) },
  hydrate: async (): Promise<ManagedEvent[]> => {
    if (!isSupabaseConfigured || !supabase) return read()
    const orgId = await organizationId()
    if (!orgId) return read()
    const { data, error } = await supabase.from('events').select('id,name,venue,starts_at,banner_path,status,content,payment_settings,short_code,published_at,scheduled_for,archived_at,studio').eq('organization_id', orgId).is('deleted_at', null).order('created_at', { ascending: false })
    if (error) throw error
    const events = (data ?? []).map(row => fromDatabase(row as EventRow))
    write(events)
    return events
  },
  loadPublic: async (identifier: string): Promise<ManagedEvent | null> => {
    const local = read().find(event => event.publication?.slug === identifier || event.publication?.shortCode === identifier)
    if (local?.status === 'published' || !isSupabaseConfigured || !supabase) return local?.status === 'published' ? local : null
    const { data, error } = await supabase.rpc('public_event_snapshot', { event_identifier: identifier })
    if (error || !data || typeof data !== 'object') return null
    const snapshot = data as { event?: EventRow }
    return snapshot.event ? fromDatabase(snapshot.event) : null
  },
  save: (event: ManagedEvent): ManagedEvent => { const next = ensureStudioEvent(event); const events = read(); const index = events.findIndex(item => item.id === next.id); if (index >= 0) events[index] = next; else events.unshift(next); write(events); void syncEvent(next).catch(() => undefined); return next },
  remove: (eventId: string): void => { write(read().filter(event => event.id !== eventId)); void removeFromDatabase(eventId).catch(() => undefined) },
}

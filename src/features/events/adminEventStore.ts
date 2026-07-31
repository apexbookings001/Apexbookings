import type { EventStatus, PaymentMethod, SeatStatus, CryptoCoinConfig } from '../../types/domain'
import type { BookingPageData } from './bookingTemplate'
import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'
import { seatLabelForPackage } from './seatLabels'
import { defaultDiscountEndsAt, validatePackageDiscount } from './packagePricing'

export type TimelineItem = { id: string; time: string; title: string; description: string }
export type Testimonial = { id: string; name: string; photo: string; review: string; rating: number }
export type FaqItem = { id: string; question: string; answer: string }
export type TicketPackage = {
  id: string
  name: string
  price: number
  originalPrice?: number
  discountedPrice?: number | null
  discountEnabled?: boolean
  discountEndsAt?: string | null
  description: string
  benefits: string[]
  color?: string
  capacity: number
  displayOrder?: number
  seatSelectionEnabled?: boolean
  enabled?: boolean
  deletedAt?: string | null
}
export type StudioSeat = { id: string; eventId: string; number: number; label: string; packageId: string; status: SeatStatus }
export type EventPaymentMethod = { enabled: boolean; hidden?: boolean; order?: number; instructions: string; destination?: string; qrCode?: string }
export type EventPaymentSettings = { usePlatformDefaults: boolean; defaultMethod: PaymentMethod; methods: Record<PaymentMethod, EventPaymentMethod>; cryptocurrencies: Record<string, CryptoCoinConfig> }
export type EventPublication = { slug: string; shortCode: string; publishedAt?: string; scheduledFor?: string; archivedAt?: string }
export type EventLocaleSettings = { countryCode: string; languageCode: string; currencyCode: string }
export type EventSocialProofOverride = {
  enabled?: boolean
  defaultCustomerName?: string
  city?: string
  state?: string
  customerImage?: string
  packageName?: string
  message?: string
  duration?: number
  delay?: number
  animation?: string
  position?: string
  pageTargeting?: string[]
  mobileVisible?: boolean
  desktopVisible?: boolean
}
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
  locale?: EventLocaleSettings; socialProofOverride?: EventSocialProofOverride
}

const id = () => crypto.randomUUID()
const image = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=900&fit=crop&auto=format'

export const createDefaultPackages = (capacity: number): TicketPackage[] => {
  const total = Math.max(0, capacity)
  const vvip = Math.floor(total * 0.1)
  const vip = Math.floor(total * 0.3)
  const regular = total - vip - vvip
  return [
    { id: id(), name: 'Regular', price: 0, description: 'General event admission.', benefits: ['Event entry'], capacity: regular, color: '#71717A', displayOrder: 0, seatSelectionEnabled: true, enabled: true },
    { id: id(), name: 'VIP', price: 0, description: 'Enhanced event experience.', benefits: ['Priority entry', 'VIP access'], capacity: vip, color: '#00FF88', displayOrder: 1, seatSelectionEnabled: true, enabled: true },
    { id: id(), name: 'VVIP', price: 0, description: 'The complete premium experience.', benefits: ['Priority entry', 'Premium access'], capacity: vvip, color: '#F59E0B', displayOrder: 2, seatSelectionEnabled: true, enabled: true },
  ]
}

export const PLATFORM_PAYMENT_DEFAULTS: EventPaymentSettings = {
  usePlatformDefaults: true,
  defaultMethod: 'apple_gift_card',
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
  return { ...defaults, ...settings, methods: { ...defaults.methods, ...settings.methods }, cryptocurrencies: { ...defaults.cryptocurrencies, ...settings.cryptocurrencies } }
}

export const slugifyEventName = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '') || 'event'
export const generateEventShortCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return `APX${Array.from(bytes, value => value.toString(36).padStart(2, '0')).join('').slice(0, 14).toUpperCase()}`
}
export const createEventPublication = (name: string): EventPublication => {
  const code = generateEventShortCode()
  return { slug: slugifyEventName(name), shortCode: code }
}

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

export const generateSeats = (eventId: string, packages: TicketPackage[], existing: StudioSeat[] = []): StudioSeat[] => {
  let number = 1
  return packages
    .filter(pkg => pkg.enabled !== false && pkg.deletedAt == null)
    .flatMap(pkg => {
      const previousSeats = existing.filter(seat => seat.packageId === pkg.id).sort((a, b) => a.number - b.number)
      return Array.from({ length: Math.max(0, pkg.capacity) }, (_, index) => {
      const previous = previousSeats[index]
      const seat = { id: previous?.id ?? id(), eventId, number, label: seatLabelForPackage(pkg.name, index + 1), packageId: pkg.id, status: previous?.status ?? 'available' as SeatStatus }
      number += 1
      return seat
      })
    })
}

export const ensureStudioEvent = (event: ManagedEvent): ManagedEvent => {
  const content = event.content ?? createStudioContent({ title: event.title, venue: event.venue, date: event.date, hostName: event.setup?.hostName ?? 'Your host', mapLink: event.setup?.mapLink ?? '', banners: event.setup?.banners })
  const packages = event.packages ?? createDefaultPackages(event.capacity)
  const seats = event.seats ?? generateSeats(event.id, packages)
  const publication = event.publication ?? createEventPublication(event.title)
  const scheduledNow = event.status === 'scheduled' && publication.scheduledFor && new Date(publication.scheduledFor).getTime() <= Date.now()
  return {
    ...event,
    status: scheduledNow ? 'published' : event.status,
    content,
    packages,
    seats,
    payments: paymentSettings(event.payments),
    publication: { ...publication, publishedAt: scheduledNow ? new Date().toISOString() : publication.publishedAt },
    locale: event.locale ?? { countryCode: 'US', languageCode: 'en-US', currencyCode: 'USD' },
  }
}

export function duplicateManagedEvent(source: ManagedEvent, change: {
  title: string
  date: string
  venue: string
  locale: EventLocaleSettings
}): ManagedEvent {
  const duplicate = structuredClone(ensureStudioEvent(source))
  const eventId = crypto.randomUUID()
  const packageIds = new Map<string, string>()

  // Only copy active (non-deleted, enabled) packages
  duplicate.packages = duplicate.packages
    ?.filter(pkg => pkg.enabled !== false && !pkg.deletedAt)
    .map((item, idx) => {
      const nextId = crypto.randomUUID()
      packageIds.set(item.id, nextId)
      return {
        ...item,
        id: nextId,
        enabled: true,
        deletedAt: null,
        displayOrder: idx,
        discountEndsAt: item.discountEnabled && (!item.discountEndsAt || Date.parse(item.discountEndsAt) <= Date.now()) ? defaultDiscountEndsAt() : item.discountEndsAt,
      }
    })

  // A duplicate gets independent seats for its new event and package IDs. It
  // never copies sold/reserved states, bookings, or temporary reservations.
  duplicate.seats = generateSeats(eventId, duplicate.packages ?? [])

  if (duplicate.content) {
    duplicate.content.timeline = duplicate.content.timeline.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.content.testimonials = duplicate.content.testimonials.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.content.faq = duplicate.content.faq.map(item => ({ ...item, id: crypto.randomUUID() }))
  }
  if (duplicate.bookingPage) {
    duplicate.bookingPage.timeline = duplicate.bookingPage.timeline.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.bookingPage.packages = duplicate.bookingPage.packages.map(item => {
      const nextId = packageIds.get(item.id) ?? crypto.randomUUID()
      const expired = item.discountEnabled && (!item.discountEndsAt || Date.parse(item.discountEndsAt) <= Date.now())
      return { ...item, id: nextId, discountEndsAt: expired ? defaultDiscountEndsAt() : item.discountEndsAt }
    })
    duplicate.bookingPage.testimonials = duplicate.bookingPage.testimonials.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.bookingPage.faq = duplicate.bookingPage.faq.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.bookingPage.venueFacts = duplicate.bookingPage.venueFacts.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.bookingPage.importantInfo = duplicate.bookingPage.importantInfo.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.bookingPage.hero.title = change.title
    duplicate.bookingPage.hero.date = change.date
    duplicate.bookingPage.hero.venue = change.venue
    duplicate.bookingPage.venue.name = change.venue
    duplicate.bookingPage.editorState = { touchedSections: [], updatedAtBySection: {} }
  }
  return {
    ...duplicate,
    id: eventId,
    title: change.title,
    date: change.date,
    venue: change.venue,
    sold: 0,
    revenue: 0,
    status: 'draft',
    locale: change.locale,
    publication: createEventPublication(change.title),
    // Copy capacity as an editable starting point
    capacity: source.capacity ?? 0,
  }
}

const cache = createProtectedMemoryStore<ManagedEvent[]>(() => [])
const read = () => cache.get()

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
    capacity: row.capacity != null ? Number(row.capacity) : Number(stored.capacity ?? 0),
    revenue: Number(stored.revenue ?? 0),
    status: row.status as EventStatus,
    schedule: stored.schedule ?? [],
    content: (row.content as EventContent | null) ?? stored.content,
    payments: (row.payment_settings as EventPaymentSettings | null) ?? stored.payments,
    publication: {
      ...(stored.publication ?? createEventPublication(String(row.name ?? 'event'))),
      slug: String(row.slug ?? stored.publication?.slug ?? slugifyEventName(String(row.name ?? 'event'))),
      shortCode: String(row.short_code ?? stored.publication?.shortCode ?? generateEventShortCode()),
      publishedAt: row.published_at ? String(row.published_at) : stored.publication?.publishedAt,
      scheduledFor: row.scheduled_for ? String(row.scheduled_for) : stored.publication?.scheduledFor,
      archivedAt: row.archived_at ? String(row.archived_at) : stored.publication?.archivedAt,
    },
    locale: {
      countryCode: String(row.country_code ?? stored.locale?.countryCode ?? 'US'),
      languageCode: String(row.language_code ?? stored.locale?.languageCode ?? 'en-US'),
      currencyCode: String(row.currency_code ?? stored.locale?.currencyCode ?? 'USD'),
    },
    socialProofOverride: (row.social_proof_override as EventSocialProofOverride | null) ?? stored.socialProofOverride,
  })
}

async function syncEvent(event: ManagedEvent): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const orgId = requireOrganizationId()
  const prepared = ensureStudioEvent(event)
  if (prepared.status === 'published') {
    const invalid = (prepared.packages ?? []).find(pkg => pkg.enabled !== false && !pkg.deletedAt && validatePackageDiscount(pkg))
    if (invalid) throw new Error(`${invalid.name}: ${validatePackageDiscount(invalid)}`)
  }

  // ── Upsert the event row ────────────────────────────────────────────────────
  const { data: savedEvent, error } = await supabase.from('events').upsert({
    id: prepared.id,
    organization_id: orgId,
    slug: prepared.publication?.slug ?? slugifyEventName(prepared.title),
    short_code: prepared.publication?.shortCode,
    name: prepared.title,
    venue: prepared.venue,
    starts_at: dateForDatabase(prepared.date),
    status: prepared.status,
    banner_path: prepared.banner,
    capacity: prepared.capacity > 0 ? prepared.capacity : null,
    content: prepared.content ?? {},
    payment_settings: prepared.payments ?? {},
    scheduled_for: prepared.publication?.scheduledFor,
    published_at: prepared.publication?.publishedAt,
    archived_at: prepared.publication?.archivedAt,
    country_code: prepared.locale?.countryCode ?? 'US',
    language_code: prepared.locale?.languageCode ?? 'en-US',
    currency_code: prepared.locale?.currencyCode ?? 'USD',
    social_proof_override: prepared.socialProofOverride ?? {},
    studio: prepared,
  }, { onConflict: 'id' }).select('slug,short_code').single()
  if (error) throw error
  if (savedEvent?.slug && prepared.publication) prepared.publication.slug = String(savedEvent.slug)

  // ── Upsert surviving packages ───────────────────────────────────────────────
  const packages = (prepared.packages ?? []).filter(pkg => pkg.enabled !== false && !pkg.deletedAt)
  if (packages.length) {
    const { error: packageError } = await supabase.from('packages').upsert(packages.map((pkg, idx) => ({
      id: pkg.id,
      event_id: prepared.id,
      name: pkg.name,
      price: pkg.price,
      original_price: pkg.originalPrice ?? pkg.price,
      discount_price: pkg.discountedPrice ?? null,
      discount_enabled: Boolean(pkg.discountEnabled),
      discount_ends_at: pkg.discountEndsAt ?? null,
      capacity: pkg.capacity,
      display_order: pkg.displayOrder ?? idx,
      seat_selection_enabled: pkg.seatSelectionEnabled !== false,
      enabled: true,
      deleted_at: null,
      offer: JSON.stringify({ description: pkg.description, benefits: pkg.benefits, color: pkg.color }),
    })), { onConflict: 'id' })
    if (packageError) throw packageError
  }

  // ── Soft-delete packages that are no longer in the active list ─────────────
  // This is the core fix for the "Remove Package" bug.
  // Any package row in Supabase for this event that is NOT in the current active
  // list gets its deleted_at set, making the removal permanent.
  const activePackageIds = packages.map(pkg => pkg.id)
  if (activePackageIds.length > 0) {
    // Soft-delete packages not in the active list
    await supabase
      .from('packages')
      .update({ deleted_at: new Date().toISOString(), enabled: false, updated_at: new Date().toISOString() })
      .eq('event_id', prepared.id)
      .is('deleted_at', null)
      .not('id', 'in', `(${activePackageIds.join(',')})`)
  } else if (prepared.packages !== undefined) {
    // All packages were removed — soft-delete everything
    await supabase
      .from('packages')
      .update({ deleted_at: new Date().toISOString(), enabled: false, updated_at: new Date().toISOString() })
      .eq('event_id', prepared.id)
      .is('deleted_at', null)
  }

  // ── Upsert seats ────────────────────────────────────────────────────────────
  const seats = prepared.seats ?? []
  if (seats.length) {
    const { error: seatError } = await supabase.from('seats').upsert(seats.map(seat => ({
      id: seat.id,
      event_id: prepared.id,
      package_id: seat.packageId,
      label: String(seat.number).padStart(3, '0'),
      status: seat.status,
      deleted_at: null,
    })), { onConflict: 'id' })
    if (seatError) throw seatError
  }
}

async function removeFromDatabase(eventId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const orgId = requireOrganizationId()
  const { error } = await supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', eventId).eq('organization_id', orgId)
  if (error) throw error
}

export const adminEventStore = {
  list: (): ManagedEvent[] => read(),
  subscribe: cache.subscribe,
  snapshot: cache.snapshot,
  hydrate: async (): Promise<ManagedEvent[]> => {
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      cache.loading()
      const orgId = requireOrganizationId()
      const { data, error } = await supabase.from('events').select('id,slug,name,venue,starts_at,banner_path,status,content,payment_settings,short_code,published_at,scheduled_for,archived_at,country_code,language_code,currency_code,social_proof_override,studio,capacity').eq('organization_id', orgId).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      const events = (data ?? []).map(row => fromDatabase(row as EventRow))
      cache.set(events)
      return events
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  loadPublic: async (identifier: string): Promise<ManagedEvent | null> => {
    const local = read().find(event => event.publication?.slug === identifier || event.publication?.shortCode === identifier)
    if (local?.status === 'published') return local
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.rpc('public_event_snapshot', { event_identifier: identifier })
    if (error) throw error
    if (!data || typeof data !== 'object') return null
    const snapshot = data as { event?: EventRow }
    return snapshot.event ? fromDatabase(snapshot.event) : null
  },
  save: (event: ManagedEvent): ManagedEvent => {
    const next = ensureStudioEvent(event)
    const events = [...read()]
    const index = events.findIndex(item => item.id === next.id)
    if (index >= 0) events[index] = next
    else events.unshift(next)
    void cache.optimistic(events, () => syncEvent(next)).catch(() => undefined)
    return next
  },
  saveAsync: async (event: ManagedEvent): Promise<ManagedEvent> => {
    const next = ensureStudioEvent(event)
    const events = [...read()]
    const index = events.findIndex(item => item.id === next.id)
    if (index >= 0) events[index] = next
    else events.unshift(next)
    await cache.optimistic(events, () => syncEvent(next))
    return next
  },
  remove: (eventId: string): void => {
    void cache.optimistic(read().filter(event => event.id !== eventId), () => removeFromDatabase(eventId)).catch(() => undefined)
  },
  removeAsync: async (eventId: string): Promise<void> => {
    await cache.optimistic(read().filter(event => event.id !== eventId), () => removeFromDatabase(eventId))
  },
  clear: cache.reset,
}

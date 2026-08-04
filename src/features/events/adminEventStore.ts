import type { EventStatus, PaymentMethod, SeatStatus, CryptoCoinConfig } from '../../types/domain'
import type { BookingPageData } from './bookingTemplate'
import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'
import { seatLabelForPackage } from './seatLabels'
import { validatePackageDiscount } from './packagePricing'
import { DEFAULT_EVENT_COUNTDOWN, isCountdownDuration, type EventCountdownSettings } from './countdown'

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
  // Card presentation is persisted alongside the same package UUID in the
  // package row's existing offer JSON. It is not a second package list.
  icon?: string
  category?: string
  badge?: string | null
  accent?: string
  glow?: string
  sections?: string[]
}
export type StudioSeat = { id: string; eventId: string; number: number; label: string; packageId: string; status: SeatStatus }
export type EventPaymentMethod = { enabled: boolean; hidden?: boolean; order?: number; instructions: string; destination?: string; qrCode?: string }
export type EventPaymentSettings = { usePlatformDefaults: boolean; defaultMethod: PaymentMethod; methods: Record<PaymentMethod, EventPaymentMethod>; cryptocurrencies: Record<string, CryptoCoinConfig> }
export type EventPublication = { slug: string; shortCode: string; publishedAt?: string; scheduledFor?: string; archivedAt?: string }
export type EventLocaleSettings = { countryCode: string; languageCode: string; currencyCode: string }
export type EventSocialProofOverride = {
  enabled?: boolean
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
  /** Publicly safe organization payment settings, provided only for a published event snapshot. */
  platformPayments?: EventPaymentSettings
  countdown?: EventCountdownSettings
  /** Server clock supplied only by the public snapshot RPC. Never persisted. */
  serverTime?: string
}

const id = () => crypto.randomUUID()
const image = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=900&fit=crop&auto=format'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const createDefaultPackages = (capacity: number): TicketPackage[] => {
  const total = Math.max(0, capacity)
  const vvip = Math.floor(total * 0.1)
  const vip = Math.floor(total * 0.3)
  const regular = total - vip - vvip
  return [
    { id: id(), name: 'Regular', price: 0, originalPrice: 0, description: 'General event admission.', benefits: ['Event entry'], capacity: regular, color: '#71717A', displayOrder: 0, seatSelectionEnabled: true, enabled: true },
    { id: id(), name: 'VIP', price: 0, originalPrice: 0, description: 'Enhanced event experience.', benefits: ['Priority entry', 'VIP access'], capacity: vip, color: '#00FF88', displayOrder: 1, seatSelectionEnabled: true, enabled: true },
    { id: id(), name: 'VVIP', price: 0, originalPrice: 0, description: 'The complete premium experience.', benefits: ['Priority entry', 'Premium access'], capacity: vvip, color: '#F59E0B', displayOrder: 2, seatSelectionEnabled: true, enabled: true },
  ]
}

const packagesFromBookingPage = (page?: BookingPageData): TicketPackage[] | undefined => {
  if (!page?.packages?.length) return undefined
  return page.packages.map((item, index) => ({
    id: item.id,
    name: item.name,
    price: item.price ?? 0,
    originalPrice: item.originalPrice ?? item.price ?? 0,
    discountedPrice: item.discountedPrice ?? null,
    discountEnabled: item.discountEnabled ?? false,
    discountEndsAt: item.discountEndsAt ?? null,
    description: item.desc ?? '',
    benefits: item.benefits ?? [],
    color: item.accent,
    capacity: item.seats ?? 0,
    displayOrder: index,
    seatSelectionEnabled: item.seatSelectionEnabled !== false,
    enabled: true,
    icon: item.icon,
    badge: item.badge,
    accent: item.accent,
    glow: item.glow,
    sections: item.sections ?? [],
  }))
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
  // Event Studio hydrates the event's own persisted packages first. Legacy
  // booking-page data is used only as a one-time compatibility source. Never
  // synthesize operational prices/allocations from a non-zero event capacity.
  const sourcePackages = event.packages ?? packagesFromBookingPage(event.bookingPage) ?? createDefaultPackages(0)
  // Early booking-page templates used readable IDs such as "regular". Package
  // and seat foreign keys are UUIDs, so upgrade those legacy IDs once before
  // any package or seat RPC is called.
  const packageIdMap = new Map<string, string>()
  const packages = sourcePackages.map(pkg => {
    const packageId = UUID_PATTERN.test(pkg.id) ? pkg.id : id()
    packageIdMap.set(pkg.id, packageId)
    return packageId === pkg.id ? pkg : { ...pkg, id: packageId }
  })
  const bookingPage = event.bookingPage ? {
    ...event.bookingPage,
    packages: event.bookingPage.packages.map((pkg, index) => ({
      ...pkg,
      // The index fallback is solely a one-time upgrade for old template
      // records; all normal editing uses the stored package UUID.
      id: packageIdMap.get(pkg.id) ?? packages[index]?.id ?? pkg.id,
    })),
  } : undefined
  // Seats are operational data. They are created only after a complete
  // Packages & Seats save, never merely because a draft has package cards.
  const seats = event.seats
    ? event.seats.map(seat => ({ ...seat, packageId: packageIdMap.get(seat.packageId) ?? seat.packageId }))
    : []
  const publication = event.publication ?? createEventPublication(event.title)
  const scheduledNow = event.status === 'scheduled' && publication.scheduledFor && new Date(publication.scheduledFor).getTime() <= Date.now()
  return {
    ...event,
    status: scheduledNow ? 'published' : event.status,
    content,
    bookingPage,
    packages,
    seats,
    payments: paymentSettings(event.payments),
    publication: { ...publication, publishedAt: scheduledNow ? new Date().toISOString() : publication.publishedAt },
    locale: event.locale ?? { countryCode: 'US', languageCode: 'en-US', currencyCode: 'USD' },
    countdown: { ...DEFAULT_EVENT_COUNTDOWN, ...event.countdown },
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
        price: 0,
        originalPrice: 0,
        discountedPrice: null,
        discountEnabled: false,
        discountEndsAt: null,
        capacity: 0,
        enabled: true,
        deletedAt: null,
        displayOrder: idx,
      }
    })

  // Seats are created only after the duplicate's administrator completes the
  // new capacity, allocation and pricing setup.
  duplicate.seats = []

  if (duplicate.content) {
    duplicate.content.timeline = duplicate.content.timeline.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.content.testimonials = duplicate.content.testimonials.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.content.faq = duplicate.content.faq.map(item => ({ ...item, id: crypto.randomUUID() }))
  }
  if (duplicate.bookingPage) {
    duplicate.bookingPage.timeline = duplicate.bookingPage.timeline.map(item => ({ ...item, id: crypto.randomUUID() }))
    duplicate.bookingPage.packages = duplicate.bookingPage.packages.map(item => {
      const nextId = packageIds.get(item.id) ?? crypto.randomUUID()
      return {
        ...item,
        id: nextId,
        price: 0,
        originalPrice: 0,
        discountedPrice: null,
        discountEnabled: false,
        discountEndsAt: null,
        seats: 0,
      }
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
    capacity: 0,
    // The duplicate inherits the chosen mode and visual intent, never an
    // active window. An organizer must explicitly start/configure it.
    countdown: duplicate.countdown ? { ...duplicate.countdown, startedAt: null, endsAt: null, lastResetAt: null, nextResetAt: null } : undefined,
  }
}

/**
 * The master booking template has visual package cards but is not itself an
 * event record. Convert only that presentation into a temporary source, then
 * route it through the same duplicateManagedEvent operation as a real event.
 * This prevents the template's example prices, allocations and capacity from
 * becoming operational values on the new draft.
 */
export function duplicateBookingTemplateEvent(sourcePage: BookingPageData, change: {
  title: string
  date: string
  venue: string
  locale: EventLocaleSettings
}): ManagedEvent {
  const page = structuredClone(sourcePage)
  const templatePackages = page.packages.map((item, index) => {
    const packageId = crypto.randomUUID()
    return {
      id: packageId,
      name: item.name,
      price: 0,
      originalPrice: 0,
      discountedPrice: null,
      discountEnabled: false,
      discountEndsAt: null,
      description: item.desc ?? '',
      benefits: item.benefits ?? [],
      color: item.accent,
      capacity: 0,
      displayOrder: index,
      seatSelectionEnabled: true,
      enabled: true,
      icon: item.icon,
      category: undefined,
      badge: item.badge,
      accent: item.accent,
      glow: item.glow,
      sections: item.sections ?? [],
    } satisfies TicketPackage
  })
  page.packages = page.packages.map((item, index) => ({
    ...item,
    id: templatePackages[index].id,
    price: 0,
    originalPrice: 0,
    discountedPrice: null,
    discountEnabled: false,
    discountEndsAt: null,
    seats: 0,
  }))
  return duplicateManagedEvent({
    id: crypto.randomUUID(),
    title: page.hero.title,
    venue: page.venue.name,
    date: page.hero.date,
    banner: page.hero.images[0],
    sold: 0,
    capacity: 0,
    revenue: 0,
    status: 'draft',
    schedule: [],
    packages: templatePackages,
    seats: [],
    bookingPage: page,
    locale: change.locale,
  }, change)
}

export type DuplicateDatabaseSnapshot = {
  eventId: string
  capacity: number | null
  packages: Array<{ id: string; eventId: string; name: string; price: number; capacity: number }>
  seatRowCount: number
}

/** Read back exactly what Supabase stored for one just-created duplicate. */
export async function verifyDuplicateDatabaseSnapshot(eventId: string): Promise<DuplicateDatabaseSnapshot> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [{ data: event, error: eventError }, { data: packages, error: packageError }, { count, error: seatError }] = await Promise.all([
    supabase.from('events').select('id,capacity').eq('id', eventId).single(),
    supabase.from('packages').select('id,event_id,name,price,capacity').eq('event_id', eventId).is('deleted_at', null).order('display_order'),
    supabase.from('seats').select('id', { count: 'exact', head: true }).eq('event_id', eventId).is('deleted_at', null),
  ])
  if (eventError) throw eventError
  if (packageError) throw packageError
  if (seatError) throw seatError
  return {
    eventId: String(event.id),
    capacity: event.capacity == null ? null : Number(event.capacity),
    packages: (packages ?? []).map(row => ({
      id: String(row.id), eventId: String(row.event_id), name: String(row.name), price: Number(row.price), capacity: Number(row.capacity),
    })),
    seatRowCount: count ?? 0,
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
    platformPayments: row.platform_payment_settings && typeof row.platform_payment_settings === 'object'
      ? paymentSettings(row.platform_payment_settings as EventPaymentSettings)
      : undefined,
    countdown: {
      ...(stored.countdown ?? DEFAULT_EVENT_COUNTDOWN),
      enabled: Boolean(row.countdown_enabled ?? stored.countdown?.enabled ?? false),
      mode: (row.countdown_mode ?? stored.countdown?.mode ?? DEFAULT_EVENT_COUNTDOWN.mode) as EventCountdownSettings['mode'],
      durationSeconds: row.countdown_duration_seconds == null ? (stored.countdown?.durationSeconds ?? DEFAULT_EVENT_COUNTDOWN.durationSeconds) : Number(row.countdown_duration_seconds),
      startedAt: row.countdown_started_at ? String(row.countdown_started_at) : stored.countdown?.startedAt ?? null,
      endsAt: row.countdown_ends_at ? String(row.countdown_ends_at) : stored.countdown?.endsAt ?? null,
      timezone: String(row.countdown_timezone ?? stored.countdown?.timezone ?? DEFAULT_EVENT_COUNTDOWN.timezone),
      renewalTime: String(row.countdown_renewal_time ?? stored.countdown?.renewalTime ?? DEFAULT_EVENT_COUNTDOWN.renewalTime),
      resetThreshold: Number(row.countdown_reset_threshold ?? stored.countdown?.resetThreshold ?? DEFAULT_EVENT_COUNTDOWN.resetThreshold),
      lastResetAt: row.countdown_last_reset_at ? String(row.countdown_last_reset_at) : stored.countdown?.lastResetAt ?? null,
      nextResetAt: row.countdown_next_reset_at ? String(row.countdown_next_reset_at) : stored.countdown?.nextResetAt ?? null,
    },
    serverTime: row.server_time ? String(row.server_time) : undefined,
  })
}

async function syncEvent(event: ManagedEvent): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const orgId = requireOrganizationId()
  const prepared = ensureStudioEvent(event)
  const invalidDiscount = (prepared.packages ?? []).find(pkg => pkg.enabled !== false && !pkg.deletedAt && pkg.discountEnabled && validatePackageDiscount(pkg))
  if (invalidDiscount) throw new Error(`${invalidDiscount.name}: ${validatePackageDiscount(invalidDiscount)}`)

  const countdown = prepared.countdown
  if (prepared.status === 'published' && countdown?.enabled) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: countdown.timezone }) } catch { throw new Error('Choose a valid event timezone for the ticket sales countdown.') }
    const eventStart = Date.parse(prepared.date)
    if (!Number.isFinite(eventStart)) throw new Error('Set a valid event start time before publishing a ticket sales countdown.')
    if (countdown.mode === 'fixed_deadline') {
      const deadline = Date.parse(countdown.endsAt ?? '')
      if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('The fixed ticket-sales deadline must be in the future.')
      if (deadline > eventStart) throw new Error('The fixed ticket-sales deadline cannot be later than the event start time.')
    } else {
      if (!isCountdownDuration(countdown.durationSeconds)) throw new Error('Choose a valid rolling booking-window duration.')
      const started = Date.parse(countdown.startedAt ?? '')
      const ends = Date.parse(countdown.endsAt ?? '')
      if (!Number.isFinite(started) || !Number.isFinite(ends)) throw new Error('Start or reset the rolling booking window before publishing.')
      if (ends > eventStart || ends <= started) throw new Error('The rolling booking-window timestamps are invalid for this event.')
    }
  }

  // Duplicate drafts deliberately begin with zero capacity, prices and seats.
  // Publishing is the boundary where the complete, saved configuration is
  // enforced, including a database check for the generated seat rows.
  const publishPackages = (prepared.packages ?? []).filter(pkg => pkg.enabled !== false && !pkg.deletedAt)
  if (prepared.status === 'published') {
    if (!Number.isInteger(prepared.capacity) || prepared.capacity <= 0) {
      throw new Error('Complete package pricing and seat allocation before publishing: enter the total venue capacity.')
    }
    const totalAllocated = publishPackages.reduce((sum, pkg) => sum + pkg.capacity, 0)
    if (totalAllocated !== prepared.capacity) {
      const detail = totalAllocated > prepared.capacity
        ? `Package allocations exceed the venue capacity by ${totalAllocated - prepared.capacity} seats.`
        : `Allocate the remaining ${prepared.capacity - totalAllocated} seats before publishing.`
      throw new Error(detail)
    }
    const incompletePackage = publishPackages.find(pkg =>
      !UUID_PATTERN.test(pkg.id)
      || !Number.isInteger(pkg.capacity)
      || pkg.capacity < 0
      || (pkg.capacity > 0 && (!Number.isFinite(pkg.price) || pkg.price <= 0))
    )
    if (incompletePackage) {
      throw new Error(`${incompletePackage.name}: complete package pricing and seat allocation before publishing.`)
    }
    const { data: seatRows, error: seatError } = await supabase
      .from('seats')
      .select('package_id')
      .eq('event_id', prepared.id)
      .is('deleted_at', null)
    if (seatError) throw seatError
    const seatCountByPackage = new Map<string, number>()
    for (const seat of seatRows ?? []) {
      const packageId = String(seat.package_id ?? '')
      seatCountByPackage.set(packageId, (seatCountByPackage.get(packageId) ?? 0) + 1)
    }
    const mismatchedSeats = publishPackages.find(pkg => (seatCountByPackage.get(pkg.id) ?? 0) !== pkg.capacity)
    if (mismatchedSeats) {
      throw new Error(`${mismatchedSeats.name}: save packages and seats to generate the allocated seats before publishing.`)
    }
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
    // Zero is a legitimate unconfigured duplicate state. Do not coerce it to
    // null, because that causes later hydration to treat it as missing data.
    capacity: prepared.capacity,
    content: prepared.content ?? {},
    payment_settings: prepared.payments ?? {},
    scheduled_for: prepared.publication?.scheduledFor,
    published_at: prepared.publication?.publishedAt,
    archived_at: prepared.publication?.archivedAt,
    country_code: prepared.locale?.countryCode ?? 'US',
    language_code: prepared.locale?.languageCode ?? 'en-US',
    currency_code: prepared.locale?.currencyCode ?? 'USD',
    social_proof_override: prepared.socialProofOverride ?? {},
    countdown_enabled: Boolean(prepared.countdown?.enabled),
    countdown_mode: prepared.countdown?.mode ?? DEFAULT_EVENT_COUNTDOWN.mode,
    countdown_duration_seconds: prepared.countdown?.durationSeconds,
    countdown_started_at: prepared.countdown?.startedAt,
    countdown_ends_at: prepared.countdown?.endsAt,
    countdown_timezone: prepared.countdown?.timezone ?? DEFAULT_EVENT_COUNTDOWN.timezone,
    countdown_renewal_time: prepared.countdown?.renewalTime ?? DEFAULT_EVENT_COUNTDOWN.renewalTime,
    countdown_reset_threshold: prepared.countdown?.resetThreshold ?? DEFAULT_EVENT_COUNTDOWN.resetThreshold,
    countdown_last_reset_at: prepared.countdown?.lastResetAt,
    countdown_next_reset_at: prepared.countdown?.nextResetAt,
    studio: prepared,
  }, { onConflict: 'id' }).select('slug,short_code').single()
  if (error) throw error
  if (savedEvent?.slug && prepared.publication) prepared.publication.slug = String(savedEvent.slug)

  // ── Upsert surviving packages ───────────────────────────────────────────────
  const packages = (prepared.packages ?? []).filter(pkg => pkg.enabled !== false && !pkg.deletedAt)
  const invalidPackage = packages.find(pkg =>
    !UUID_PATTERN.test(pkg.id)
    || !Number.isFinite(pkg.price)
    || pkg.price < 0
    || !Number.isFinite(pkg.originalPrice ?? pkg.price)
    || (pkg.originalPrice ?? pkg.price) < 0
  )
  if (invalidPackage) {
    throw new Error(`${invalidPackage.name || 'Package'} needs a valid UUID and a non-negative draft price.`)
  }
  if (packages.length) {
    const { error: packageError } = await supabase.from('packages').upsert(packages.map((pkg, idx) => ({
      id: pkg.id,
      event_id: prepared.id,
      name: pkg.name,
      price: pkg.price,
      original_price: pkg.originalPrice ?? pkg.price,
      discount_price: pkg.discountEnabled ? pkg.discountedPrice ?? null : null,
      discount_enabled: Boolean(pkg.discountEnabled),
      discount_ends_at: pkg.discountEnabled ? pkg.discountEndsAt ?? null : null,
      capacity: pkg.capacity,
      display_order: pkg.displayOrder ?? idx,
      seat_selection_enabled: pkg.seatSelectionEnabled !== false,
      enabled: true,
      deleted_at: null,
      offer: JSON.stringify({
        description: pkg.description,
        benefits: pkg.benefits,
        color: pkg.color,
        icon: pkg.icon,
        category: pkg.category,
        badge: pkg.badge,
        accent: pkg.accent,
        glow: pkg.glow,
        sections: pkg.sections ?? [],
      }),
    })), { onConflict: 'id' })
    if (packageError) {
      console.error('[event-packages] package upsert failed', {
        code: packageError.code,
        message: packageError.message,
        details: packageError.details,
        hint: packageError.hint,
        packageCount: packages.length,
        packages: packages.map(pkg => ({ id: pkg.id, idIsUuid: UUID_PATTERN.test(pkg.id), price: pkg.price, originalPrice: pkg.originalPrice ?? pkg.price })),
      })
      throw new Error(packageError.message)
    }
  }

  // ── Soft-delete packages that are no longer in the active list ─────────────
  // This is the core fix for the "Remove Package" bug.
  // Any package row in Supabase for this event that is NOT in the current active
  // list gets its deleted_at set, making the removal permanent.
  const activePackageIds = packages.map(pkg => pkg.id)
  if (activePackageIds.length > 0) {
    // Use the protected removal RPC so packages with sold or reserved seats
    // are archived rather than deleting their historical relationships.
    const { data: stalePackages, error: staleError } = await supabase
      .from('packages').select('id').eq('event_id', prepared.id).is('deleted_at', null)
      .not('id', 'in', `(${activePackageIds.join(',')})`)
    if (staleError) throw staleError
    for (const stale of stalePackages ?? []) {
      const { error: removeError } = await supabase.rpc('admin_remove_package', { p_package_id: stale.id })
      if (removeError) throw removeError
    }
  } else if (prepared.packages !== undefined) {
    // All packages were removed — soft-delete everything
    const { data: stalePackages, error: staleError } = await supabase
      .from('packages').select('id').eq('event_id', prepared.id).is('deleted_at', null)
    if (staleError) throw staleError
    for (const stale of stalePackages ?? []) {
      const { error: removeError } = await supabase.rpc('admin_remove_package', { p_package_id: stale.id })
      if (removeError) throw removeError
    }
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
      const { data, error } = await supabase.from('events').select('id,slug,name,venue,starts_at,banner_path,status,content,payment_settings,short_code,published_at,scheduled_for,archived_at,country_code,language_code,currency_code,social_proof_override,studio,capacity,countdown_enabled,countdown_mode,countdown_duration_seconds,countdown_started_at,countdown_ends_at,countdown_timezone,countdown_renewal_time,countdown_reset_threshold,countdown_last_reset_at,countdown_next_reset_at').eq('organization_id', orgId).is('deleted_at', null).order('created_at', { ascending: false })
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
    const snapshot = data as { event?: EventRow; server_time?: string; platform_payment_settings?: EventPaymentSettings }
    return snapshot.event ? fromDatabase({ ...snapshot.event, server_time: snapshot.server_time, platform_payment_settings: snapshot.platform_payment_settings }) : null
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
  resetCountdown: async (eventId: string): Promise<ManagedEvent> => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.rpc('admin_reset_event_countdown', { target_event_id: eventId })
    if (error) throw error
    const payload = data as { event?: EventRow; server_time?: string }
    if (!payload.event) throw new Error('The countdown reset did not return the event.')
    const next = fromDatabase({ ...payload.event, server_time: payload.server_time })
    cache.set(read().map(event => event.id === eventId ? next : event))
    return next
  },
}

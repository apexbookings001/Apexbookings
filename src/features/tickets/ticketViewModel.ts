import type { TicketRecord } from '../bookings/ticketStore'

export type TicketViewModel = {
  ticketId: string
  ticketCode: string
  qrToken?: string
  verificationUrl: string
  eventTitle: string
  eventHost: string
  eventImage: string
  customerName: string
  eventDate: string
  eventTime: string
  timezone?: string
  venue: string
  packageName: string
  packageBenefits: string[]
  seatLabel: string
  organizationName: string
  organizationLogo: string
  ticketStatus: TicketRecord['status']
  bookingReference: string
}

export type TicketViewModelFallback = Partial<Pick<TicketRecord,
  'eventName' | 'eventHost' | 'eventBanner' | 'eventDate' | 'eventTime' | 'eventVenue' |
  'eventTimezone' | 'customerName' | 'packageName' | 'packageAccent' | 'seatLabel' | 'benefits' | 'ticketNumber' |
  'bookingReference' | 'status'
>>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T|$)/

function supportedTimeZone(value?: string): string | undefined {
  if (!value) return undefined
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return value
  } catch {
    return undefined
  }
}

function timezoneLabel(suppliedTime: string, configuredTimeZone?: string): string | undefined {
  if (configuredTimeZone) return configuredTimeZone
  return suppliedTime.match(/\b(?:UTC|GMT|[A-Z]{2,5})$/)?.[0]
}

function asDate(value?: string): Date | null {
  if (!value || !ISO_DATE.test(value)) return null
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatEventDate(value: string, locale: string, timeZone?: string): string {
  const date = asDate(value)
  if (!date) return value || 'To be announced'
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timeZone ?? 'UTC',
  }).format(date)
}

function formatEventTime(timestamp: string, suppliedTime: string, locale: string, timeZone?: string): string {
  // Booking pages already store a deliberate human-facing time (for example,
  // "8:00 PM EDT"). Keep it instead of converting it through the viewer's
  // timezone. ISO timestamps are formatted from their explicit instant.
  if (suppliedTime && !ISO_DATE.test(suppliedTime)) return suppliedTime
  const date = asDate(suppliedTime) ?? asDate(timestamp)
  if (!date) return suppliedTime || 'Time to be announced'
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone ?? 'UTC',
    timeZoneName: 'short',
  }).format(date)
}

export function createTicketViewModel(
  ticket: TicketRecord | null | undefined,
  fallback: TicketViewModelFallback,
  options: { locale?: string; verificationUrl?: string; eventTimezone?: string } = {},
): TicketViewModel {
  const source = { ...fallback, ...(ticket ?? {}) }
  const locale = options.locale || 'en-US'
  const configuredTimezone = timezoneLabel(source.eventTime || '', options.eventTimezone ?? source.eventTimezone)
  const timezone = supportedTimeZone(configuredTimezone)
  const eventDateValue = source.eventDate || ''
  const ticketCode = source.ticketNumber || source.bookingReference || 'TKT-PENDING'
  const qrToken = ticket?.qrToken
  const verificationUrl = options.verificationUrl || (qrToken && typeof window !== 'undefined'
    ? `${window.location.origin}/ticket/${encodeURIComponent(qrToken)}`
    : '')

  return {
    ticketId: ticket?.id || '',
    ticketCode,
    qrToken,
    verificationUrl,
    eventTitle: source.eventName || 'Event',
    eventHost: source.eventHost || source.eventName || 'Apex Bookings',
    eventImage: source.eventBanner || '',
    customerName: source.customerName || 'Guest',
    eventDate: formatEventDate(eventDateValue, locale, timezone),
    eventTime: formatEventTime(eventDateValue, source.eventTime || '', locale, timezone),
    timezone: configuredTimezone,
    venue: source.eventVenue || 'Venue to be announced',
    packageName: source.packageName || 'General admission',
    packageBenefits: source.benefits || [],
    seatLabel: source.seatLabel || 'Seat to be assigned',
    organizationName: 'Apex Bookings',
    organizationLogo: '/apex-email-ticket-logo.png',
    ticketStatus: source.status || 'pending',
    bookingReference: source.bookingReference || '',
  }
}

export function safeTicketFilename(ticketCode: string): string {
  const safeCode = (ticketCode || 'ticket')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `apex-ticket-${safeCode || 'ticket'}.png`
}

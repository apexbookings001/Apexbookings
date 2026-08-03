export type CountdownMode = 'fixed_deadline' | 'rolling_window'

export type EventCountdownSettings = {
  enabled: boolean
  mode: CountdownMode
  durationSeconds: number | null
  startedAt: string | null
  endsAt: string | null
  timezone: string
  renewalTime: string
  resetThreshold: number
  lastResetAt: string | null
  nextResetAt: string | null
}

export const COUNTDOWN_PRESETS = [
  [86400, '1 day'], [172800, '2 days'], [259200, '3 days'], [345600, '4 days'], [432000, '5 days'], [518400, '6 days'], [604800, '7 days'],
  [1209600, '2 weeks'], [1814400, '3 weeks'], [2419200, '4 weeks'], [3024000, '5 weeks'],
] as const

export const DEFAULT_EVENT_COUNTDOWN: EventCountdownSettings = {
  enabled: false, mode: 'fixed_deadline', durationSeconds: 86400, startedAt: null, endsAt: null,
  timezone: 'UTC', renewalTime: '09:00', resetThreshold: 0.5, lastResetAt: null, nextResetAt: null,
}

export const isCountdownDuration = (value: number | null | undefined): value is number =>
  typeof value === 'number' && COUNTDOWN_PRESETS.some(([seconds]) => seconds === value)

export const presetLabel = (seconds: number | null | undefined) => COUNTDOWN_PRESETS.find(([value]) => value === seconds)?.[1] ?? 'Custom duration'

const parts = (date: Date, timezone: string) => {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return Object.fromEntries(format.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value])) as Record<string, string>
}

/** Convert a date/time in the event timezone to an absolute time. The second
 * pass handles timezone offsets that change around daylight-saving boundaries. */
export const dateAtEventTimezone = (year: number, month: number, day: number, hour: number, minute: number, timezone: string) => {
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let value = target
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = parts(new Date(value), timezone)
    const actualAsUtc = Date.UTC(Number(actual.year), Number(actual.month) - 1, Number(actual.day), Number(actual.hour), Number(actual.minute))
    value += target - actualAsUtc
  }
  return value
}

const previousRenewal = (now: number, timezone: string, renewalTime: string, startedAt: number) => {
  const eventNow = parts(new Date(now), timezone)
  const [hours, minutes] = renewalTime.split(':').map(value => Number(value))
  const currentMidnight = Date.UTC(Number(eventNow.year), Number(eventNow.month) - 1, Number(eventNow.day))
  let candidate = dateAtEventTimezone(Number(eventNow.year), Number(eventNow.month), Number(eventNow.day), hours || 0, minutes || 0, timezone)
  if (candidate > now) {
    const yesterday = new Date(currentMidnight - 86400000)
    candidate = dateAtEventTimezone(yesterday.getUTCFullYear(), yesterday.getUTCMonth() + 1, yesterday.getUTCDate(), hours || 0, minutes || 0, timezone)
  }
  return Math.max(startedAt, candidate)
}

export type CountdownState = { visible: boolean; closed: boolean; endAt: number | null; remainingMs: number; label: string }

export function getCountdownState(settings: EventCountdownSettings | undefined, eventStartsAt: string | undefined, now: number): CountdownState {
  if (!settings?.enabled) return { visible: false, closed: false, endAt: null, remainingMs: 0, label: '' }
  const eventStart = Date.parse(eventStartsAt ?? '')
  if (!Number.isFinite(eventStart)) return { visible: false, closed: true, endAt: null, remainingMs: 0, label: '' }
  if (now >= eventStart) return { visible: true, closed: true, endAt: eventStart, remainingMs: 0, label: settings.mode === 'fixed_deadline' ? 'Ticket sales have closed' : 'Booking is no longer available' }
  if (settings.mode === 'fixed_deadline') {
    const configuredEnd = Date.parse(settings.endsAt ?? '')
    const endAt = Math.min(configuredEnd, eventStart)
    const closed = !Number.isFinite(endAt) || now >= endAt
    return { visible: true, closed, endAt, remainingMs: closed ? 0 : endAt - now, label: closed ? 'Ticket sales have closed' : 'Ticket sales close in' }
  }
  if (!isCountdownDuration(settings.durationSeconds) || !settings.startedAt) return { visible: false, closed: false, endAt: null, remainingMs: 0, label: '' }
  const startedAt = Date.parse(settings.startedAt)
  if (!Number.isFinite(startedAt)) return { visible: false, closed: false, endAt: null, remainingMs: 0, label: '' }
  const duration = settings.durationSeconds * 1000
  const daily = settings.durationSeconds <= 172800
  const cycleStart = daily
    ? previousRenewal(now, settings.timezone || 'UTC', settings.renewalTime || '09:00', startedAt)
    : startedAt + Math.floor(Math.max(0, now - startedAt) / (duration * 0.5)) * duration * 0.5
  const endAt = Math.min(cycleStart + duration, eventStart)
  return { visible: true, closed: false, endAt, remainingMs: Math.max(0, endAt - now), label: 'Booking window refreshes in' }
}

export function formatCountdown(ms: number, compact = false) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const base = `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
  return compact || days > 0 ? base : `${base} ${String(secs).padStart(2, '0')}s`
}

export function countdownSummary(settings: EventCountdownSettings) {
  if (!settings.enabled) return 'Ticket sales countdown is disabled.'
  if (settings.mode === 'fixed_deadline') return 'Ticket sales will close at the selected deadline or when the event begins, whichever comes first.'
  const threshold = settings.durationSeconds && settings.durationSeconds >= 259200 ? ` and renews when ${presetLabel(settings.durationSeconds / 2)} remain` : ` and refreshes daily at ${settings.renewalTime}`
  return `This booking window lasts ${presetLabel(settings.durationSeconds)}${threshold}. It stops when the event begins.`
}

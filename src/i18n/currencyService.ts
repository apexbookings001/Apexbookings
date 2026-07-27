// ─── Currency Service ─────────────────────────────────────────────────────────
// Fetches exchange rates from the free open.er-api.com endpoint.
// Caches in localStorage with a 6-hour TTL.
// Falls back to last cached rates if the network request fails.
// All prices are stored internally in USD; this service converts them.

import type { CurrencyCode } from './localeConfig'
import { LOCALES } from './localeConfig'

const CACHE_KEY = 'apex-fx-rates'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours in ms
const API_URL = 'https://open.er-api.com/v6/latest/USD'

// Baseline hardcoded fallback rates (USD base)
// Used only when both network AND cache are unavailable
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, CAD: 1.37, GBP: 0.79, EUR: 0.92,
  BRL: 5.42, MXN: 18.50, AUD: 1.55, COP: 4150,
}

interface CacheEntry {
  rates: Record<string, number>
  fetchedAt: number
}

let memoryRates: Record<string, number> | null = null

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry
  } catch {
    return null
  }
}

function writeCache(rates: Record<string, number>) {
  try {
    const entry: CacheEntry = { rates, fetchedAt: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    memoryRates = rates
  } catch {
    memoryRates = rates
  }
}

function isCacheFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL
}

/** Returns current exchange rates (USD base). Never throws. */
async function fetchRates(): Promise<Record<string, number>> {
  // 1. In-memory (fastest)
  if (memoryRates) return memoryRates

  // 2. localStorage cache
  const cached = readCache()
  if (cached && isCacheFresh(cached)) {
    memoryRates = cached.rates
    return cached.rates
  }

  // 3. Network fetch
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as { rates: Record<string, number> }
    if (json.rates) {
      writeCache(json.rates)
      return json.rates
    }
  } catch {
    // Network unavailable — use stale cache or hardcoded fallback
  }

  // 4. Stale cache (still better than hardcoded)
  if (cached?.rates) {
    memoryRates = cached.rates
    return cached.rates
  }

  // 5. Hardcoded fallback
  memoryRates = FALLBACK_RATES
  return FALLBACK_RATES
}

/** Pre-warm the rates cache on app boot (fire-and-forget). */
export function warmRates() {
  fetchRates().catch(() => {})
}

/** Convert a USD amount to the visitor's local currency. */
export async function convertFromUSD(usdAmount: number, currency: CurrencyCode): Promise<number> {
  const rates = await fetchRates()
  const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1
  return usdAmount * rate
}

/** Synchronous conversion using cached/memory rates (for render-time use). */
export function convertFromUSDSync(usdAmount: number, currency: CurrencyCode): number {
  const rates = memoryRates ?? readCache()?.rates ?? FALLBACK_RATES
  const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1
  return usdAmount * rate
}

/** Format a local-currency amount using Intl.NumberFormat. */
export function formatCurrency(amount: number, currency: CurrencyCode, bcp47: string): string {
  try {
    return new Intl.NumberFormat(bcp47, {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'COP' ? 0 : 2,
      maximumFractionDigits: currency === 'COP' ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** Get a pre-built price formatter for the current locale (synchronous). */
export function buildPriceFormatter(currency: CurrencyCode, bcp47: string): (usd: number) => string {
  const rates = memoryRates ?? readCache()?.rates ?? FALLBACK_RATES
  const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1
  return (usd: number) => formatCurrency(usd * rate, currency, bcp47)
}

/** Ensure rates are loaded; call once at app mount. */
export async function initCurrencyService(currency: CurrencyCode): Promise<void> {
  const cached = readCache()
  if (cached && isCacheFresh(cached)) {
    memoryRates = cached.rates
    return
  }
  await fetchRates()
}

// Expose the supported locales for reference
export { LOCALES }

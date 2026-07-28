import type { CurrencyCode } from './localeConfig'
import { LOCALES } from './localeConfig'
import { supabase } from '../lib/supabase'
import { localeService } from './localeService'

const FALLBACK_RATES: Record<string, number> = {
  USD: 1, CAD: 1.37, GBP: 0.79, EUR: 0.92,
  BRL: 5.42, MXN: 18.50, AUD: 1.55, COP: 4150,
}

let memoryRates: Record<string, number> | null = null

async function fetchRates(): Promise<Record<string, number>> {
  if (memoryRates) return memoryRates
  try {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.functions.invoke('currency-rates', { body: {} })
    if (error || !data?.rates) throw error ?? new Error('Currency rates are unavailable.')
    memoryRates = data.rates as Record<string, number>
    return memoryRates
  } catch {
    memoryRates = FALLBACK_RATES
    return FALLBACK_RATES
  }
}

export function warmRates() { void fetchRates() }

export async function convertFromUSD(usdAmount: number, currency: CurrencyCode): Promise<number> {
  const rates = await fetchRates()
  return usdAmount * (rates[currency] ?? FALLBACK_RATES[currency] ?? 1)
}

export function convertFromUSDSync(usdAmount: number, currency: CurrencyCode): number {
  const rates = memoryRates ?? FALLBACK_RATES
  return usdAmount * (rates[currency] ?? FALLBACK_RATES[currency] ?? 1)
}

export function formatCurrency(amount: number, currency: CurrencyCode, bcp47: string): string {
  return localeService.formatCurrency(amount, currency, bcp47)
}

export function buildPriceFormatter(currency: CurrencyCode, bcp47: string): (usd: number) => string {
  const rates = memoryRates ?? FALLBACK_RATES
  const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1
  return (usd: number) => formatCurrency(usd * rate, currency, bcp47)
}

export async function initCurrencyService(_currency: CurrencyCode): Promise<void> { await fetchRates() }

export { LOCALES }

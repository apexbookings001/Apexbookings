import { DEFAULT_LOCALE, LOCALES, type CurrencyCode, type LocaleCode, type LocaleConfig } from './localeConfig'

const TIMEZONE_COUNTRY: Record<string, LocaleCode> = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES',
  'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'America/Bogota': 'CO',
}

export const localeService = {
  supported: Object.values(LOCALES),
  fallback: DEFAULT_LOCALE,
  get(code?: string | null): LocaleConfig {
    return code && code in LOCALES ? LOCALES[code as LocaleCode] : DEFAULT_LOCALE
  },
  detectReliableCountry(): LocaleCode | null {
    try {
      const injected = document.querySelector<HTMLMetaElement>('meta[name="apex-country"]')?.content?.toUpperCase()
      if (injected && injected in LOCALES) return injected as LocaleCode
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      return TIMEZONE_COUNTRY[timezone] ?? null
    } catch {
      return null
    }
  },
  resolve(input: { manual?: string | null; detected?: string | null; eventCountry?: string | null }): LocaleConfig {
    for (const code of [input.manual, input.detected, input.eventCountry]) {
      if (code && code in LOCALES) return LOCALES[code as LocaleCode]
    }
    return DEFAULT_LOCALE
  },
  formatCurrency(amount: number, currency: CurrencyCode, bcp47?: string): string {
    const locale = bcp47 ?? Object.values(LOCALES).find(item => item.currency === currency)?.bcp47 ?? DEFAULT_LOCALE.bcp47
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency,
        minimumFractionDigits: currency === 'COP' ? 0 : 2,
        maximumFractionDigits: currency === 'COP' ? 0 : 2,
      }).format(amount)
    } catch {
      return `${currency} ${amount.toFixed(currency === 'COP' ? 0 : 2)}`
    }
  },
}

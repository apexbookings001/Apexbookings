// ─── Locale Configuration ─────────────────────────────────────────────────────
// Registry of all supported countries, languages, currencies, and locales.

export type LocaleCode = 'US' | 'CA' | 'GB' | 'FR' | 'DE' | 'IT' | 'ES' | 'BR' | 'MX' | 'AU' | 'CO'
export type LangCode = 'en' | 'fr' | 'de' | 'it' | 'es' | 'pt'
export type CurrencyCode = 'USD' | 'CAD' | 'GBP' | 'EUR' | 'BRL' | 'MXN' | 'AUD' | 'COP'

export interface LocaleConfig {
  code: LocaleCode
  country: string
  flag: string
  language: LangCode
  languageName: string
  currency: CurrencyCode
  currencySymbol: string
  bcp47: string // IETF language tag for Intl APIs
}

export const LOCALES: Record<LocaleCode, LocaleConfig> = {
  US: { code: 'US', country: 'United States', flag: '🇺🇸', language: 'en', languageName: 'English', currency: 'USD', currencySymbol: '$', bcp47: 'en-US' },
  CA: { code: 'CA', country: 'Canada', flag: '🇨🇦', language: 'en', languageName: 'English', currency: 'CAD', currencySymbol: 'CA$', bcp47: 'en-CA' },
  GB: { code: 'GB', country: 'United Kingdom', flag: '🇬🇧', language: 'en', languageName: 'English', currency: 'GBP', currencySymbol: '£', bcp47: 'en-GB' },
  FR: { code: 'FR', country: 'France', flag: '🇫🇷', language: 'fr', languageName: 'Français', currency: 'EUR', currencySymbol: '€', bcp47: 'fr-FR' },
  DE: { code: 'DE', country: 'Germany', flag: '🇩🇪', language: 'de', languageName: 'Deutsch', currency: 'EUR', currencySymbol: '€', bcp47: 'de-DE' },
  IT: { code: 'IT', country: 'Italy', flag: '🇮🇹', language: 'it', languageName: 'Italiano', currency: 'EUR', currencySymbol: '€', bcp47: 'it-IT' },
  ES: { code: 'ES', country: 'Spain', flag: '🇪🇸', language: 'es', languageName: 'Español', currency: 'EUR', currencySymbol: '€', bcp47: 'es-ES' },
  BR: { code: 'BR', country: 'Brazil', flag: '🇧🇷', language: 'pt', languageName: 'Português', currency: 'BRL', currencySymbol: 'R$', bcp47: 'pt-BR' },
  MX: { code: 'MX', country: 'Mexico', flag: '🇲🇽', language: 'es', languageName: 'Español', currency: 'MXN', currencySymbol: 'MX$', bcp47: 'es-MX' },
  AU: { code: 'AU', country: 'Australia', flag: '🇦🇺', language: 'en', languageName: 'English', currency: 'AUD', currencySymbol: 'A$', bcp47: 'en-AU' },
  CO: { code: 'CO', country: 'Colombia', flag: '🇨🇴', language: 'es', languageName: 'Español', currency: 'COP', currencySymbol: 'COP', bcp47: 'es-CO' },
}

export const LOCALE_LIST: LocaleConfig[] = Object.values(LOCALES)
export const DEFAULT_LOCALE: LocaleConfig = LOCALES.US

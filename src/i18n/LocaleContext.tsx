// ─── Locale Context ──────────────────────────────────────────────────────────
// Central React context for the entire localization system.
// Provides: locale config, translations, price formatter, and locale switcher.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { CurrencyCode, LangCode, LocaleCode, LocaleConfig } from './localeConfig'
import { DEFAULT_LOCALE, LOCALES } from './localeConfig'
import { localeService } from './localeService'
import { buildPriceFormatter, initCurrencyService } from './currencyService'
import { en } from './translations/en'
import { fr } from './translations/fr'
import { de } from './translations/de'
import { es } from './translations/es'
import { pt } from './translations/pt'
import { it } from './translations/it'
import type { Translations } from './translations/en'

// ─── Translation map ──────────────────────────────────────────────────────────
const TRANSLATIONS: Record<string, Translations> = { en, fr, de, es, pt, it }

function getTranslations(lang: string): Translations {
  return TRANSLATIONS[lang] ?? en
}

// ─── Persistence ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'apex-locale'

function loadSaved(): LocaleCode | null {
  try { return localStorage.getItem(STORAGE_KEY) as LocaleCode | null } catch { return null }
}
function saveLocale(code: LocaleCode) {
  try { localStorage.setItem(STORAGE_KEY, code) } catch {}
}

// ─── Interpolation helper ─────────────────────────────────────────────────────
/** Replace {key} placeholders in a translation string. */
export function tr(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

// ─── Context type ─────────────────────────────────────────────────────────────
interface LocaleContextValue {
  locale: LocaleConfig
  translations: Translations
  formatPrice: (usd: number) => string
  setLocale: (code: LocaleCode) => void
  isManualOverride: boolean
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  translations: en,
  formatPrice: (usd) => `$${usd.toFixed(2)}`,
  setLocale: () => {},
  isManualOverride: false,
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function LocaleProvider({ children, eventCountryCode, eventCurrencyCode, eventLanguageCode }: { children: React.ReactNode; eventCountryCode?: string; eventCurrencyCode?: string; eventLanguageCode?: string }) {
  const initialSaved = loadSaved()
  const initialDetected = localeService.detectReliableCountry()
  const [localeCode, setLocaleCode] = useState<LocaleCode>(() => {
    return localeService.resolve({ manual: initialSaved, detected: initialDetected, eventCountry: eventCountryCode }).code
  })
  const [isManualOverride, setIsManualOverride] = useState(() => initialSaved !== null)
  const [usingEventDefaults, setUsingEventDefaults] = useState(() => !initialSaved && !initialDetected && Boolean(eventCountryCode))
  const [ratesReady, setRatesReady] = useState(false)

  const baseLocale = LOCALES[localeCode] ?? DEFAULT_LOCALE
  const locale = useMemo<LocaleConfig>(() => usingEventDefaults ? {
    ...baseLocale,
    currency: (eventCurrencyCode || baseLocale.currency) as CurrencyCode,
    bcp47: eventLanguageCode || baseLocale.bcp47,
    language: ((eventLanguageCode || baseLocale.bcp47).split('-')[0] || baseLocale.language) as LangCode,
  } : baseLocale, [baseLocale, eventCurrencyCode, eventLanguageCode, usingEventDefaults])

  useEffect(() => {
    if (loadSaved()) return
    const detected = localeService.detectReliableCountry()
    setLocaleCode(localeService.resolve({ detected, eventCountry: eventCountryCode }).code)
    setUsingEventDefaults(!detected && Boolean(eventCountryCode))
  }, [eventCountryCode])

  // Load exchange rates on mount / locale change
  useEffect(() => {
    initCurrencyService(locale.currency).then(() => setRatesReady(true))
  }, [locale.currency])

  const formatPrice = useMemo(
    () => buildPriceFormatter(locale.currency, locale.bcp47),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale.currency, locale.bcp47, ratesReady],
  )

  const translations = useMemo(() => getTranslations(locale.language), [locale.language])

  function handleSetLocale(code: LocaleCode) {
    if (!LOCALES[code]) return
    setLocaleCode(code)
    setIsManualOverride(true)
    setUsingEventDefaults(false)
    saveLocale(code)
  }

  const value: LocaleContextValue = useMemo(
    () => ({ locale, translations, formatPrice, setLocale: handleSetLocale, isManualOverride }),
    [locale, translations, formatPrice, isManualOverride],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLocale() {
  return useContext(LocaleContext)
}

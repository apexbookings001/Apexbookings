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
import { uiTranslations } from './uiTranslations'

// ─── Translation map ──────────────────────────────────────────────────────────
const TRANSLATIONS: Record<string, Translations> = { en, fr, de, es, pt, it }

function getTranslations(lang: string): Translations {
  return TRANSLATIONS[lang] ?? en
}

// ─── Persistence ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'apex-locale'
const LANGUAGE_STORAGE_KEY = 'apex-language'

function loadSaved(): LocaleCode | null {
  try { return localStorage.getItem(STORAGE_KEY) as LocaleCode | null } catch { return null }
}
function saveLocale(code: LocaleCode) {
  try { localStorage.setItem(STORAGE_KEY, code) } catch {}
}
function loadLanguage(): LangCode | null {
  try { const value = localStorage.getItem(LANGUAGE_STORAGE_KEY); return value && value in TRANSLATIONS ? value as LangCode : null } catch { return null }
}
function saveLanguage(code: LangCode) { try { localStorage.setItem(LANGUAGE_STORAGE_KEY, code) } catch {} }

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
  setLanguage: (code: LangCode) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
  isManualOverride: boolean
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  translations: en,
  formatPrice: (usd) => `$${usd.toFixed(2)}`,
  setLocale: () => {},
  setLanguage: () => {},
  t: key => key,
  formatDate: value => new Date(value).toLocaleDateString(),
  isManualOverride: false,
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function LocaleProvider({ children, eventCountryCode, eventCurrencyCode, eventLanguageCode }: { children: React.ReactNode; eventCountryCode?: string; eventCurrencyCode?: string; eventLanguageCode?: string }) {
  const initialSaved = loadSaved()
  const initialLanguage = loadLanguage()
  const initialDetected = localeService.detectReliableCountry()
  const [localeCode, setLocaleCode] = useState<LocaleCode>(() => {
    return localeService.resolve({ manual: initialSaved, detected: initialDetected, eventCountry: eventCountryCode }).code
  })
  const [isManualOverride, setIsManualOverride] = useState(() => initialSaved !== null)
  const [language, setLanguageState] = useState<LangCode>(() => initialLanguage ?? ((eventLanguageCode?.split('-')[0] as LangCode | undefined) || LOCALES[localeCode]?.language || 'en'))
  const [usingEventDefaults, setUsingEventDefaults] = useState(() => !initialSaved && !initialDetected && Boolean(eventCountryCode))
  const [ratesReady, setRatesReady] = useState(false)

  const baseLocale = LOCALES[localeCode] ?? DEFAULT_LOCALE
  const languageLocale = language === 'en' ? baseLocale.bcp47 : ({ fr: 'fr-FR', de: 'de-DE', es: 'es-ES', pt: 'pt-BR', it: 'it-IT' } as const)[language]
  const locale = useMemo<LocaleConfig>(() => ({
    ...baseLocale,
    currency: (usingEventDefaults && eventCurrencyCode ? eventCurrencyCode : baseLocale.currency) as CurrencyCode,
    bcp47: languageLocale,
    language,
    languageName: Object.values(LOCALES).find(item => item.language === language)?.languageName ?? baseLocale.languageName,
  }), [baseLocale, eventCurrencyCode, language, languageLocale, usingEventDefaults])

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

  function handleSetLanguage(code: LangCode) {
    if (!TRANSLATIONS[code]) return
    setLanguageState(code)
    setIsManualOverride(true)
    saveLanguage(code)
  }

  const translate = useMemo(() => (key: string, vars: Record<string, string | number> = {}) => {
    const selected = uiTranslations[locale.language]?.[key]
    const fallback = uiTranslations.en[key as keyof typeof uiTranslations.en]
    if (!selected && import.meta.env.DEV) console.warn(`[i18n] Missing translation: ${locale.language}.${key}`)
    return tr(String(selected ?? fallback ?? key), vars)
  }, [locale.language])
  const formatDate = useMemo(() => (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(locale.bcp47, options ?? { dateStyle: 'long' }).format(date)
  }, [locale.bcp47])

  const value: LocaleContextValue = useMemo(
    () => ({ locale, translations, formatPrice, setLocale: handleSetLocale, setLanguage: handleSetLanguage, t: translate, formatDate, isManualOverride }),
    [formatDate, locale, translations, formatPrice, isManualOverride, translate],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLocale() {
  return useContext(LocaleContext)
}

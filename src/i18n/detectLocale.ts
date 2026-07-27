// ─── Locale Detection ─────────────────────────────────────────────────────────
// Detects the visitor's country using browser-native APIs only.
// Order: navigator.language → navigator.languages → timezone → fallback US

import type { LocaleCode } from './localeConfig'

// Map BCP47 language/region tags → supported locale code
const LANG_MAP: Record<string, LocaleCode> = {
  'en-us': 'US', 'en': 'US',
  'en-ca': 'CA',
  'en-gb': 'GB', 'en-uk': 'GB',
  'en-au': 'AU',
  'fr': 'FR', 'fr-fr': 'FR', 'fr-be': 'FR', 'fr-ch': 'FR',
  'de': 'DE', 'de-de': 'DE', 'de-at': 'DE', 'de-ch': 'DE',
  'it': 'IT', 'it-it': 'IT', 'it-ch': 'IT',
  'es': 'ES', 'es-es': 'ES',
  'es-mx': 'MX',
  'es-co': 'CO', 'es-419': 'CO',
  'pt': 'BR', 'pt-br': 'BR',
}

// Map IANA timezone identifiers → supported locale code
const TZ_MAP: Record<string, LocaleCode> = {
  // Canada
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Winnipeg': 'CA',
  'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Edmonton': 'CA',
  // UK
  'Europe/London': 'GB', 'Europe/Belfast': 'GB',
  // France
  'Europe/Paris': 'FR',
  // Germany
  'Europe/Berlin': 'DE', 'Europe/Munich': 'DE', 'Europe/Busingen': 'DE',
  // Italy
  'Europe/Rome': 'IT',
  // Spain
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
  // Brazil
  'America/Sao_Paulo': 'BR', 'America/Manaus': 'BR', 'America/Recife': 'BR',
  'America/Belem': 'BR', 'America/Fortaleza': 'BR', 'America/Bahia': 'BR',
  // Mexico
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Cancun': 'MX',
  'America/Merida': 'MX', 'America/Mazatlan': 'MX', 'America/Chihuahua': 'MX',
  // Australia
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU',
  // Colombia
  'America/Bogota': 'CO',
}

function fromLanguageTag(tag: string): LocaleCode | null {
  const lower = tag.toLowerCase()
  if (LANG_MAP[lower]) return LANG_MAP[lower]
  // Try just the primary subtag (e.g. "en" from "en-NZ")
  const primary = lower.split('-')[0]
  return LANG_MAP[primary] ?? null
}

function fromTimezone(tz: string): LocaleCode | null {
  return TZ_MAP[tz] ?? null
}

/**
 * Detect the visitor's best-match supported locale code.
 * Uses only browser-native APIs; no network calls.
 */
export function detectLocaleCode(): LocaleCode {
  try {
    // 1. Primary: navigator.language
    const primary = navigator.language
    if (primary) {
      const match = fromLanguageTag(primary)
      if (match) return match
    }

    // 2. Language list (ordered by preference)
    const langs = navigator.languages ?? []
    for (const lang of langs) {
      const match = fromLanguageTag(lang)
      if (match) return match
    }

    // 3. Fallback: browser timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const tzMatch = fromTimezone(tz)
    if (tzMatch) return tzMatch
  } catch {
    // Silently fall through to default
  }

  // 4. Hard fallback
  return 'US'
}

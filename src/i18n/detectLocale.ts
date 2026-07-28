import type { LocaleCode } from './localeConfig'
import { localeService } from './localeService'

export function detectLocaleCode(): LocaleCode {
  return localeService.detectReliableCountry() ?? 'US'
}

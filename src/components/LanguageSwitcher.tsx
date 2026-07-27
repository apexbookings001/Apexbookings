// ─── Language Switcher ────────────────────────────────────────────────────────
// Footer-level language & country selector.
// Shows flag + country + currency. Persists selection to localStorage.

import { useLocale } from '../i18n/LocaleContext'
import { LOCALE_LIST } from '../i18n/localeConfig'
import type { LocaleCode } from '../i18n/localeConfig'

interface Props {
  isDark: boolean
  textColor: string
  mutedColor: string
  borderColor: string
  cardBg: string
  accentColor: string
}

export function LanguageSwitcher({ isDark, textColor, mutedColor, borderColor, cardBg, accentColor }: Props) {
  const { locale, setLocale, translations } = useLocale()

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-mono uppercase tracking-widest" style={{ color: mutedColor }}>
        {translations.footer.language}
      </div>
      <div className="relative inline-block">
        <select
          id="language-switcher"
          value={locale.code}
          onChange={e => setLocale(e.target.value as LocaleCode)}
          className="appearance-none pl-8 pr-8 py-2 rounded-xl text-xs font-medium cursor-pointer outline-none transition-all"
          style={{
            background: isDark ? 'rgba(255,255,255,0.05)' : cardBg,
            border: `1px solid ${borderColor}`,
            color: textColor,
            boxShadow: isDark ? 'none' : '0 2px 8px rgba(15,23,42,0.04)',
          }}
        >
          {LOCALE_LIST.map(loc => (
            <option key={loc.code} value={loc.code} style={{ background: isDark ? '#111113' : '#FFFFFF', color: '#0F172A' }}>
              {loc.flag} {loc.country} ({loc.currency})
            </option>
          ))}
        </select>
        {/* Flag overlay */}
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm leading-none">
          {locale.flag}
        </span>
        {/* Chevron overlay */}
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3"
          style={{ color: mutedColor }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      <div className="text-[10px]" style={{ color: mutedColor }}>
        {locale.flag} {locale.languageName} · {locale.currency}
      </div>
    </div>
  )
}

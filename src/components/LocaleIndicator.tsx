// ─── Locale Indicator ─────────────────────────────────────────────────────────
// Small nav pill: 🇺🇸 English (USD)
// Appears in the public nav bar. Clicking it opens the language switcher.

import { useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { LOCALE_LIST } from '../i18n/localeConfig'
import type { LocaleCode } from '../i18n/localeConfig'

interface Props {
  isDark: boolean
  textColor: string
  borderColor: string
  cardBg: string
}

export function LocaleIndicator({ isDark, textColor, borderColor, cardBg }: Props) {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative" style={{ zIndex: 60 }}>
      <button
        id="locale-indicator-btn"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all hover:-translate-y-0.5"
        style={{
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(37,99,235,0.06)',
          border: `1px solid ${borderColor}`,
          color: textColor,
        }}
        title="Change language"
      >
        <span className="text-sm leading-none">{locale.flag}</span>
        <span className="hidden sm:inline">{locale.languageName}</span>
        <span style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }}>
          ({locale.currency})
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 opacity-50">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div
            className="absolute right-0 top-full mt-2 w-52 rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: cardBg, border: `1px solid ${borderColor}`, backdropFilter: 'blur(20px)' }}
          >
            <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest"
              style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', borderBottom: `1px solid ${borderColor}` }}>
              Select Language
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {LOCALE_LIST.map(loc => (
                <button
                  key={loc.code}
                  onClick={() => { setLocale(loc.code as LocaleCode); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors"
                  style={{
                    background: locale.code === loc.code
                      ? (isDark ? 'rgba(0,255,136,0.08)' : 'rgba(37,99,235,0.07)')
                      : 'transparent',
                    color: locale.code === loc.code
                      ? (isDark ? '#00FF88' : '#2563EB')
                      : textColor,
                  }}
                >
                  <span className="text-base leading-none w-5 shrink-0">{loc.flag}</span>
                  <span className="flex-1 font-medium">{loc.country}</span>
                  <span className="font-mono text-[10px] opacity-60">{loc.currency}</span>
                  {locale.code === loc.code && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 shrink-0">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

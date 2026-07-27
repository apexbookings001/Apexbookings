import { createContext, useContext } from 'react'

export type ThemeTokens = {
  isDark: boolean; bg: string; bg2: string; bg3: string; card: string
  cardBorder: string; border: string; text: string; textSub: string
  textMuted: string; navBg: string; inputBg: string
  cardShadow: string; btnShadow: string
  accent: string; accentDim: string; accentGlow: string; accentText: string
  sectionAlt: string; inputBorder: string; inputShadow: string
}

export const DARK: ThemeTokens = {
  isDark: true, bg: '#09090B', bg2: '#111113', bg3: '#18181B',
  card: 'rgba(255,255,255,0.03)', cardBorder: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.07)', text: '#FAFAFA', textSub: '#A1A1AA',
  textMuted: '#52525B', navBg: 'rgba(9,9,11,0.88)', inputBg: 'rgba(255,255,255,0.05)',
  cardShadow: '0 4px 24px rgba(0,0,0,0.4)', btnShadow: 'none',
  accent: '#00FF88', accentDim: '#00C866', accentGlow: 'rgba(0,255,136,0.25)',
  accentText: '#09090B', sectionAlt: '#111113', inputBorder: 'rgba(255,255,255,0.1)',
  inputShadow: 'none',
}

export const LIGHT: ThemeTokens = {
  isDark: false, bg: '#F7F8FA', bg2: '#F1F3F5', bg3: '#ECEFF3',
  card: '#FFFFFF', cardBorder: '#E1E5EA',
  border: '#E1E5EA', text: '#171A1F', textSub: '#5F6773',
  textMuted: '#87909D', navBg: 'rgba(255,255,255,0.9)', inputBg: '#FAFBFC',
  cardShadow: '0 10px 28px rgba(23,26,31,0.06)',
  btnShadow: '0 6px 16px rgba(21,94,239,0.16)',
  accent: '#155EEF', accentDim: '#004EEB', accentGlow: 'rgba(21,94,239,0.16)',
  accentText: '#FFFFFF', sectionAlt: '#F1F5F9', inputBorder: '#E2E8F0',
  inputShadow: '0 1px 2px rgba(23,26,31,0.04)',
}

export const ThemeCtx = createContext({ t: DARK, toggle: () => { } })
export const useTheme = () => useContext(ThemeCtx)

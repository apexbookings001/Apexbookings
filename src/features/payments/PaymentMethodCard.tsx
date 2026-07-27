// src/features/payments/PaymentMethodCard.tsx
// Premium payment selection card with official PNG icon, hover animations, active state
import { getPaymentIcon } from './PaymentAssets'
import { useTheme } from '../../theme'

type Props = {
  methodId: string
  label: string
  description: string
  isSelected: boolean
  accentColor: string
  badge?: string
  onClick: () => void
  iconOverride?: string // optional pre-resolved icon URL
}

export function PaymentMethodCard({ methodId, label, description, isSelected, accentColor, badge, onClick, iconOverride }: Props) {
  const iconUrl = iconOverride ?? getPaymentIcon(methodId)
  const { t } = useTheme()
  const accent = t.isDark ? accentColor : t.accent

  return (
    <button
      onClick={onClick}
      className="w-full text-left group transition-all duration-200"
      style={{
        background: isSelected ? `${accent}0D` : t.card,
        border: `1.5px solid ${isSelected ? accent : t.cardBorder}`,
        borderRadius: '16px',
        padding: '14px 16px',
        transform: isSelected ? 'scale(1.005)' : 'scale(1)',
        boxShadow: isSelected
          ? `0 8px 20px ${accent}18, inset 0 1px 0 ${accent}12`
          : t.isDark ? '0 2px 8px rgba(0,0,0,0.15)' : '0 8px 18px rgba(23,26,31,0.07), 0 1px 2px rgba(23,26,31,0.04)',
      }}
    >
      <div className="flex items-center gap-3.5">
        {/* Payment icon */}
        <div
          className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
          style={{
            background: isSelected ? `${accent}12` : t.isDark ? 'rgba(255,255,255,0.06)' : '#F5F7FA',
            border: `1px solid ${isSelected ? `${accent}35` : t.border}`,
            padding: '7px',
          }}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={label}
              className="w-full h-full object-contain"
              style={{ borderRadius: '6px', transform: methodId === 'cash_app' ? 'scale(1.4)' : 'scale(1)' }}
            />
          ) : (
            <div
              className="w-full h-full rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#71717A' }}
            >
              💳
            </div>
          )}
        </div>

        {/* Label + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-semibold transition-colors duration-200"
              style={{ color: isSelected ? t.text : (t.isDark ? '#D4D4D8' : t.text) }}
            >
              {label}
            </span>
            {badge && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                style={{ background: t.isDark ? 'rgba(245,158,11,0.15)' : '#FFF7E6', color: '#A15C00' }}
              >
                {badge}
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: isSelected ? t.textSub : t.textMuted }}>
            {description}
          </div>
        </div>

        {/* Selection indicator */}
        <div className="shrink-0">
          {isSelected ? (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: accent }}
            >
              <span className="text-[10px] font-bold" style={{ color: '#09090B' }}>✓</span>
            </div>
          ) : (
            <div
              className="w-5 h-5 rounded-full transition-colors duration-200"
              style={{ border: `2px solid ${t.isDark ? 'rgba(255,255,255,0.15)' : '#C8CED6'}` }}
            />
          )}
        </div>
      </div>
    </button>
  )
}

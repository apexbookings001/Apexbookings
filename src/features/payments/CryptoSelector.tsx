// src/features/payments/CryptoSelector.tsx
// Customer-facing cryptocurrency picker — shown when user selects "Cryptocurrency"
import { useState, useEffect } from 'react'
import { getSupportedCryptocurrencies } from './PaymentAssets'
import type { CryptoCoinConfig } from '../../types/domain'
import { useTheme } from '../../theme'

export type CryptoCoin = {
  id: string
  name: string
  symbol: string
  icon: string
  address: string
  network: string
  instructions: string
}

type Props = {
  accentColor: string
  cryptocurrencies: Record<string, CryptoCoinConfig>
  onSelect: (coin: CryptoCoin) => void
}

export function CryptoSelector({ accentColor, cryptocurrencies, onSelect }: Props) {
  const { t } = useTheme()
  const accent = t.isDark ? accentColor : t.accent
  const [selected, setSelected] = useState<string | null>(null)
  const [coins, setCoins] = useState<CryptoCoin[]>([])

  useEffect(() => {
    function build() {
      const supportedCoins = getSupportedCryptocurrencies()
      const available = supportedCoins
        .filter(c => cryptocurrencies[c.id]?.enabled)
        .map(c => {
          const config = cryptocurrencies[c.id]!
          return {
            id: c.id,
            name: c.name,
            symbol: c.symbol,
            icon: c.icon,
            address: config.address,
            network: config.network,
            instructions: config.instructions ?? `Send exact amount in ${c.symbol} to the wallet address below.`,
          }
        })
      setCoins(available)
    }
    build()
  }, [cryptocurrencies])

  if (coins.length === 0) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
        <div className="text-3xl mb-2">⚠️</div>
        <div className="text-sm font-semibold" style={{ color: t.text }}>No cryptocurrencies configured</div>
        <div className="text-xs mt-1" style={{ color: t.textMuted }}>The event organizer has not yet configured cryptocurrency payment addresses.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-mono uppercase tracking-widest mb-4" style={{ color: t.textMuted }}>
        Choose Cryptocurrency
      </div>
      <div className="grid gap-2.5">
        {coins.map(coin => {
          const isSelected = selected === coin.id
          return (
            <button
              key={coin.id}
              onClick={() => {
                setSelected(coin.id)
                onSelect(coin)
              }}
              className="w-full text-left transition-all duration-200"
              style={{
                background: isSelected ? `${accent}0D` : t.inputBg,
                border: `1.5px solid ${isSelected ? accent : t.border}`,
                borderRadius: '16px',
                padding: '14px 16px',
                transform: isSelected ? 'scale(1.005)' : 'scale(1)',
                boxShadow: isSelected ? `0 8px 20px ${accent}18` : t.isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 8px 18px rgba(23,26,31,0.07), 0 1px 2px rgba(23,26,31,0.04)',
              }}
            >
              <div className="flex items-center gap-3">
                {/* Radio indicator */}
                <div
                  className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all"
                  style={{
                    border: `2px solid ${isSelected ? accent : (t.isDark ? 'rgba(255,255,255,0.2)' : '#C8CED6')}`,
                    background: isSelected ? accent : 'transparent',
                  }}
                >
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#09090B' }} />
                  )}
                </div>

                {/* Icon */}
                <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                  style={{ background: t.isDark ? 'rgba(255,255,255,0.06)' : '#F5F7FA', padding: '4px' }}>
                  <img
                    src={coin.icon}
                    alt={coin.name}
                    className="w-full h-full object-contain"
                    style={{ borderRadius: '8px' }}
                  />
                </div>

                {/* Name + Symbol */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: t.text }}>
                    {coin.name}
                  </div>
                  <div className="text-xs mt-0.5 font-mono" style={{ color: isSelected ? accent : t.textMuted }}>
                    {coin.symbol}
                  </div>
                </div>

                {/* Network pill */}
                <div className="text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0"
                  style={{
                    background: isSelected ? `${accent}12` : (t.isDark ? 'rgba(255,255,255,0.05)' : '#F5F7FA'),
                    color: isSelected ? accent : t.textMuted,
                    border: `1px solid ${isSelected ? `${accent}35` : t.border}`,
                  }}>
                  {coin.network}
                </div>

                {/* Checkmark */}
                {isSelected && (
                  <div className="shrink-0 text-xs font-bold" style={{ color: accent }}>✓</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

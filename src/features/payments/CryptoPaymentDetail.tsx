// src/features/payments/CryptoPaymentDetail.tsx
// Displays full payment instructions for a chosen cryptocurrency
// Shows: icon, name, wallet address, network, QR code, copy button, instructions
import { useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { CryptoCoin } from './CryptoSelector'
import { useTheme } from '../../theme'

type Props = {
  coin: CryptoCoin
  amount?: number
  accentColor: string
  onBack: () => void
  /** File input ref from parent for proof upload */
  fileInputRef: React.RefObject<HTMLInputElement>
  proofFiles: File[]
  onUploadClick: () => void
}

export function CryptoPaymentDetail({ coin, amount, accentColor, onBack, fileInputRef, proofFiles, onUploadClick }: Props) {
  const [copied, setCopied] = useState(false)
  const { t } = useTheme()
  const accent = t.isDark ? accentColor : t.accent

  const copyAddress = useCallback(() => {
    if (!coin.address) return
    navigator.clipboard?.writeText(coin.address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }, [coin.address])

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
        style={{ color: accent }}
      >
        ← Back to coin selection
      </button>

      {/* Coin header */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: t.inputBg,
          border: `1px solid ${t.border}`,
          boxShadow: t.isDark ? 'none' : '0 8px 18px rgba(23,26,31,0.06)',
        }}
      >
        {/* Icon + Name */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${accent}12`, border: `1px solid ${accent}30`, padding: '8px' }}
          >
            <img src={coin.icon} alt={coin.name} className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="font-bold text-base" style={{ color: t.text }}>{coin.name}</div>
            <div className="text-xs font-mono mt-0.5" style={{ color: accent }}>{coin.symbol}</div>
          </div>
          {/* Network */}
          <div
            className="ml-auto text-[10px] px-2.5 py-1 rounded-full font-mono"
            style={{
              background: `${accent}12`,
              color: accent,
              border: `1px solid ${accent}30`,
            }}
          >
            {coin.network}
          </div>
        </div>

        {/* Amount */}
        {amount != null && amount > 0 && (
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: `${accent}08`, border: `1px solid ${accent}20` }}
          >
            <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>
              Send exactly
            </div>
            <div className="text-xl font-bold font-mono" style={{ color: accent }}>
              ${amount.toFixed(2)} USD
            </div>
            <div className="text-xs mt-0.5" style={{ color: t.textMuted }}>
              in {coin.symbol} (network fees apply)
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="rounded-2xl p-3" style={{ background: '#FFFFFF' }}>
            {coin.address ? (
              <QRCodeSVG
                value={coin.address}
                size={148}
                bgColor="#FFFFFF"
                fgColor="#09090B"
                level="M"
              />
            ) : (
              <div
                className="w-[148px] h-[148px] rounded-xl flex items-center justify-center text-center"
                style={{ background: '#F4F4F5' }}
              >
                <div>
                  <div className="text-2xl mb-1">📭</div>
                  <div className="text-xs" style={{ color: t.textMuted }}>Address not configured</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Wallet Address */}
        <div>
          <div className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: t.textMuted }}>
            Wallet Address
          </div>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-3"
            style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.isDark ? 'none' : '0 4px 10px rgba(23,26,31,0.04)' }}
          >
            <span
              className="flex-1 font-mono text-xs break-all leading-relaxed select-all"
              style={{ color: t.text }}
            >
              {coin.address || '— Not configured —'}
            </span>
            <button
              onClick={copyAddress}
              disabled={!coin.address}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
              style={{
                background: copied ? `${accent}20` : t.inputBg,
                color: copied ? accent : t.textSub,
                border: `1px solid ${copied ? `${accent}40` : t.border}`,
                transform: copied ? 'scale(0.96)' : 'scale(1)',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Payment instructions */}
        {coin.instructions && (
          <div
            className="rounded-xl p-3 text-xs leading-relaxed"
            style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.15)',
              color: '#FCD34D',
            }}
          >
            ⚠️ {coin.instructions}
          </div>
        )}
      </div>

      {/* Proof upload */}
      <div>
        <div className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: t.textMuted }}>
          Upload Transaction Proof
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
        />
        <button
          onClick={onUploadClick}
          className="w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-1.5 transition-all duration-200"
          style={{
            borderColor: proofFiles.length > 0 ? accent : t.border,
            background: proofFiles.length > 0 ? `${accent}06` : t.inputBg,
          }}
        >
          <span className="text-2xl flex justify-center items-center h-8">
            {proofFiles.length > 0 ? '✅' : <img src="/icons/upload-file.gif" alt="Upload" className="w-8 h-8 object-contain" />}
          </span>
          <span className="text-sm" style={{ color: proofFiles.length > 0 ? accent : t.textMuted }}>
            {proofFiles.length > 0
              ? `${proofFiles.length} file(s) uploaded — tap to add more`
              : 'Upload screenshot of your transaction'}
          </span>
        </button>
      </div>
    </div>
  )
}

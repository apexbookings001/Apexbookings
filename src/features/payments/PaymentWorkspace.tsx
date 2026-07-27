import React from 'react'
import type { PaymentMethod } from '../../types/domain'
import { PLATFORM_PAYMENT_DEFAULTS, type EventPaymentSettings } from '../events/adminEventStore'
import { getSupportedCryptocurrencies, getPaymentIcon } from './PaymentAssets'

const methods: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: 'apple_gift_card', label: 'Apple Gift Card', hint: 'Gift-card images are reviewed manually.' },
  { id: 'paypal', label: 'PayPal', hint: 'Collect payment confirmation before review.' },
  { id: 'cryptocurrency', label: 'Cryptocurrency', hint: 'Accept multiple cryptocurrencies.' },
  { id: 'cash_app', label: 'Cash App', hint: 'Provide a Cash Tag and payment instructions.' },
  { id: 'bank_transfer', label: 'Bank Transfer', hint: 'Reservations expire automatically after 30 minutes.' },
]

const field = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400'

export function PaymentWorkspace({ settings, onChange, close }: { settings: EventPaymentSettings; onChange: (settings: EventPaymentSettings) => void; close: () => void }) {
  const update = (next: Partial<EventPaymentSettings>) => onChange({ ...settings, ...next })
  
  const updateMethod = (method: PaymentMethod, change: Partial<EventPaymentSettings['methods'][PaymentMethod]>) => 
    update({ methods: { ...settings.methods, [method]: { ...settings.methods[method], ...change } } })

  const updateCrypto = (coinId: string, change: Partial<EventPaymentSettings['cryptocurrencies'][string]>) => {
    const current = settings.cryptocurrencies[coinId] || { enabled: false, address: '', network: '' };
    update({ cryptocurrencies: { ...settings.cryptocurrencies, [coinId]: { ...current, ...change } } });
  }

  const reorderMethod = (method: PaymentMethod, direction: -1 | 1) => {
    const ordered = [...methods].sort((a, b) => (settings.methods[a.id]?.order ?? methods.indexOf(a)) - (settings.methods[b.id]?.order ?? methods.indexOf(b)))
    const index = ordered.findIndex(item => item.id === method)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return
    ;[ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]]
    const nextMethods = { ...settings.methods }
    ordered.forEach((item, order) => { nextMethods[item.id] = { ...nextMethods[item.id], order } })
    update({ methods: nextMethods })
  }

  const enabled = methods.filter(method => settings.methods[method.id]?.enabled && !settings.methods[method.id]?.hidden)
  const cryptoCoins = getSupportedCryptocurrencies();

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-zinc-950/85 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#111113] p-5 text-white md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Event configuration</p>
            <h2 className="font-serif text-2xl font-bold">Payment methods</h2>
            <p className="mt-1 text-sm text-zinc-400">Payment settings apply only to this event and do not change platform defaults.</p>
          </div>
          <button onClick={close} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-zinc-300">Close</button>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <strong>Use platform defaults</strong>
              <span className="mt-1 block text-xs text-zinc-500">Turn this off to preserve a dedicated event override.</span>
            </span>
            <input type="checkbox" checked={settings.usePlatformDefaults} onChange={event => onChange(event.target.checked ? JSON.parse(JSON.stringify(PLATFORM_PAYMENT_DEFAULTS)) : { ...settings, usePlatformDefaults: false })}/>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">Ticket charges</p>
          <p className="mt-1 text-xs text-zinc-400">Applied automatically to every package and shown before payment.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Service fee (USD)
              <input type="number" min="0" step="0.01" value={settings.pricing.serviceFee} onChange={event => update({ pricing: { ...settings.pricing, serviceFee: Math.max(0, Number(event.target.value) || 0) } })} className={field}/>
            </label>
            <label className="text-xs text-zinc-400">
              Tax percentage
              <input type="number" min="0" max="100" step="0.1" value={settings.pricing.taxPercentage} onChange={event => update({ pricing: { ...settings.pricing, taxPercentage: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } })} className={field}/>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[...methods].sort((a, b) => (settings.methods[a.id]?.order ?? methods.indexOf(a)) - (settings.methods[b.id]?.order ?? methods.indexOf(b))).map((method, index) => {
            const config = settings.methods[method.id] || { enabled: false, instructions: '' };
            const iconUrl = getPaymentIcon(method.id);
            return (
              <article key={method.id} className={`rounded-2xl border p-4 ${config.enabled ? 'border-emerald-400/30 bg-emerald-400/[.04]' : 'border-white/10 bg-white/[.02]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {iconUrl ? <img src={iconUrl} alt={method.label} className="w-10 h-10 object-contain rounded" /> : <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-xl">💳</div>}
                    <div>
                      <h3 className="font-semibold">{method.label}</h3>
                      <p className="mt-1 text-xs text-zinc-500">{method.hint}</p>
                    </div>
                  </div>
                  <input type="checkbox" checked={config.enabled} onChange={event => updateMethod(method.id, { enabled: event.target.checked })}/>
                </div>
                <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3 text-xs text-zinc-400">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!config.hidden} onChange={event => updateMethod(method.id, { hidden: !event.target.checked })}/> Visible to customers</label>
                  <div className="ml-auto flex gap-1"><button type="button" disabled={index === 0} onClick={() => reorderMethod(method.id, -1)} className="rounded-lg bg-white/5 px-2 py-1 disabled:opacity-30">Move up</button><button type="button" disabled={index === methods.length - 1} onClick={() => reorderMethod(method.id, 1)} className="rounded-lg bg-white/5 px-2 py-1 disabled:opacity-30">Move down</button></div>
                </div>
                {config.enabled && method.id !== 'cryptocurrency' && (
                  <div className="mt-4">
                    <label className="block text-xs text-zinc-400">
                      Destination / account / wallet
                      <input value={config.destination ?? ''} onChange={event => updateMethod(method.id, { destination: event.target.value })} placeholder={method.id === 'cash_app' ? '$CashTag' : 'Account or email'} className={field}/>
                    </label>
                    <label className="mt-3 block text-xs text-zinc-400">
                      Customer instructions
                      <textarea value={config.instructions} onChange={event => updateMethod(method.id, { instructions: event.target.value })} className={`${field} h-24 resize-y`}/>
                    </label>
                  </div>
                )}
                {config.enabled && method.id === 'cryptocurrency' && (
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    <p className="text-xs text-zinc-400">Configure accepted coins</p>
                    {cryptoCoins.map(coin => {
                      const cConfig = settings.cryptocurrencies?.[coin.id] || { enabled: false, address: '', network: '' };
                      return (
                        <div key={coin.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img src={coin.icon} alt={coin.name} className="w-6 h-6 object-contain" />
                              <span className="text-sm">{coin.name} ({coin.symbol})</span>
                            </div>
                            <input type="checkbox" checked={cConfig.enabled} onChange={e => updateCrypto(coin.id, { enabled: e.target.checked })} />
                          </div>
                          {cConfig.enabled && (
                            <div className="mt-3 space-y-2">
                              <input value={cConfig.address} onChange={e => updateCrypto(coin.id, { address: e.target.value })} placeholder="Wallet address" className={field} />
                              <input value={cConfig.network} onChange={e => updateCrypto(coin.id, { network: e.target.value })} placeholder="Network (e.g. ERC20)" className={field} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            )
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 p-4">
          <label className="text-xs text-zinc-400">
            Default payment method
            <select value={settings.defaultMethod} onChange={event => update({ defaultMethod: event.target.value as PaymentMethod })} className={field}>
              {enabled.map(method => <option key={method.id} value={method.id}>{method.label}</option>)}
            </select>
          </label>
          {!enabled.length && <p className="mt-3 text-xs text-amber-200">Enable at least one method before publishing this event.</p>}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={close} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-zinc-950">Apply payment settings</button>
        </div>
      </div>
    </div>
  )
}

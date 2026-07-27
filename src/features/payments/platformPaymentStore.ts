// src/features/payments/platformPaymentStore.ts
// Global platform-level payment settings (admin configures once, applies platform-wide)
import type { PaymentMethod, CryptoCoinConfig } from '../../types/domain'
import { supabase } from '../../lib/supabase'

export type PlatformMethodConfig = {
  id: PaymentMethod
  enabled: boolean
  isDefault: boolean
  order: number
}

export type PlatformPaymentSettings = {
  methods: PlatformMethodConfig[]
  cryptocurrencies: Record<string, CryptoCoinConfig>
  defaultCrypto: string
}

const KEY = 'apex.platform-payment-settings'

const DEFAULT_SETTINGS: PlatformPaymentSettings = {
  methods: [
    { id: 'apple_gift_card', enabled: true,  isDefault: true,  order: 0 },
    { id: 'paypal',          enabled: true,  isDefault: false, order: 1 },
    { id: 'cryptocurrency',  enabled: true,  isDefault: false, order: 2 },
    { id: 'cash_app',        enabled: true,  isDefault: false, order: 3 },
    { id: 'bank_transfer',   enabled: true,  isDefault: false, order: 4 },
  ],
  cryptocurrencies: {
    bitcoin:  { enabled: true,  address: '',  network: 'Bitcoin',   label: 'Bitcoin (BTC)',   instructions: 'Send exact amount to the wallet address below.' },
    ethereum: { enabled: true,  address: '',  network: 'ERC-20',    label: 'Ethereum (ETH)', instructions: 'Send on the ERC-20 network only.' },
    usdt:     { enabled: false, address: '',  network: 'TRC-20',    label: 'USDT',           instructions: 'Send USDT via TRC-20 network.' },
    solana:   { enabled: false, address: '',  network: 'Solana',    label: 'Solana (SOL)',   instructions: 'Send SOL on the Solana network.' },
    xrp:      { enabled: false, address: '',  network: 'XRP Ledger',label: 'XRP',            instructions: 'Send XRP on the XRP Ledger.' },
    litecoin: { enabled: false, address: '',  network: 'Litecoin',  label: 'Litecoin (LTC)', instructions: 'Send LTC on the Litecoin network.' },
  },
  defaultCrypto: 'bitcoin',
}

function read(): PlatformPaymentSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as PlatformPaymentSettings
    const stored = JSON.parse(raw) as PlatformPaymentSettings
    // Merge in any new default methods the store doesn't have yet
    const storedIds = stored.methods.map(m => m.id)
    DEFAULT_SETTINGS.methods.forEach(dm => {
      if (!storedIds.includes(dm.id)) stored.methods.push(dm)
    })
    return stored
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as PlatformPaymentSettings
  }
}

function write(settings: PlatformPaymentSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

type Listener = () => void
const listeners = new Set<Listener>()

async function syncToSupabase(settings: PlatformPaymentSettings): Promise<void> {
  if (!supabase) return
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return
  const { data: organizationId, error: organizationError } = await supabase.rpc('bootstrap_admin_workspace')
  if (organizationError || !organizationId) return
  await supabase.from('settings').upsert({ organization_id: organizationId, ticket_template: { platformPaymentSettings: settings } }, { onConflict: 'organization_id' })
  await supabase.from('payment_methods').upsert(settings.methods.map(method => ({ organization_id: organizationId, method: method.id, enabled: method.enabled, is_default: method.isDefault, display_order: method.order })), { onConflict: 'organization_id,method' })
  const wallets = Object.entries(settings.cryptocurrencies).map(([coin, config]) => ({ organization_id: organizationId, coin, symbol: coin.toUpperCase(), network: config.network || 'Default', wallet_address: config.address, label: config.label, instructions: config.instructions, enabled: config.enabled, is_default: settings.defaultCrypto === coin }))
  if (wallets.length) await supabase.from('crypto_wallets').upsert(wallets, { onConflict: 'organization_id,coin,network' })
}

export const platformPaymentStore = {
  get(): PlatformPaymentSettings {
    return read()
  },
  save(settings: PlatformPaymentSettings): void {
    write(settings)
    listeners.forEach(fn => fn())
    void syncToSupabase(settings).catch(() => undefined)
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** Returns only enabled methods sorted by order */
  enabledMethods(): PlatformMethodConfig[] {
    return read().methods.filter(m => m.enabled).sort((a, b) => a.order - b.order)
  },
  /** Returns only enabled crypto coins that have a wallet address */
  enabledCoins(): Record<string, CryptoCoinConfig> {
    const coins = read().cryptocurrencies
    return Object.fromEntries(
      Object.entries(coins).filter(([, c]) => c.enabled && c.address.trim() !== '')
    )
  },
  getDefaultMethod(): PaymentMethod {
    const m = read().methods.find(m => m.isDefault && m.enabled)
    return m?.id ?? 'apple_gift_card'
  },
}

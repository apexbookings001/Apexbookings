import type { PaymentMethod, CryptoCoinConfig } from '../../types/domain'
import { supabase } from '../../lib/supabase'
import { createProtectedMemoryStore } from '../../services/supabase/memoryStore'
import { requireOrganizationId } from '../../services/supabase/workspace'

export type PlatformMethodConfig = { id: PaymentMethod; enabled: boolean; isDefault: boolean; order: number }
export type PlatformPaymentSettings = { methods: PlatformMethodConfig[]; cryptocurrencies: Record<string, CryptoCoinConfig>; defaultCrypto: string }

const DEFAULT_SETTINGS: PlatformPaymentSettings = {
  methods: [
    { id: 'apple_gift_card', enabled: true, isDefault: true, order: 0 },
    { id: 'paypal', enabled: true, isDefault: false, order: 1 },
    { id: 'cryptocurrency', enabled: true, isDefault: false, order: 2 },
    { id: 'cash_app', enabled: true, isDefault: false, order: 3 },
    { id: 'bank_transfer', enabled: true, isDefault: false, order: 4 },
  ],
  cryptocurrencies: {
    bitcoin: { enabled: true, address: '', network: 'Bitcoin', label: 'Bitcoin (BTC)', instructions: 'Send exact amount to the wallet address below.' },
    ethereum: { enabled: true, address: '', network: 'ERC-20', label: 'Ethereum (ETH)', instructions: 'Send on the ERC-20 network only.' },
    usdt: { enabled: false, address: '', network: 'TRC-20', label: 'USDT', instructions: 'Send USDT via TRC-20 network.' },
    solana: { enabled: false, address: '', network: 'Solana', label: 'Solana (SOL)', instructions: 'Send SOL on the Solana network.' },
    xrp: { enabled: false, address: '', network: 'XRP Ledger', label: 'XRP', instructions: 'Send XRP on the XRP Ledger.' },
    litecoin: { enabled: false, address: '', network: 'Litecoin', label: 'Litecoin (LTC)', instructions: 'Send LTC on the Litecoin network.' },
  },
  defaultCrypto: 'bitcoin',
}

const cloneDefaults = () => structuredClone(DEFAULT_SETTINGS)
const cache = createProtectedMemoryStore<PlatformPaymentSettings>(cloneDefaults)

async function persist(settings: PlatformPaymentSettings) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const organizationId = requireOrganizationId()
  const methodResult = await supabase.from('payment_methods').upsert(settings.methods.map(method => ({
    organization_id: organizationId,
    method: method.id,
    enabled: method.enabled,
    is_default: method.isDefault,
    display_order: method.order,
    deleted_at: null,
  })), { onConflict: 'organization_id,method' })
  if (methodResult.error) throw methodResult.error

  const wallets = Object.entries(settings.cryptocurrencies).map(([coin, config]) => ({
    organization_id: organizationId,
    coin,
    symbol: coin.toUpperCase(),
    network: config.network || 'Default',
    wallet_address: config.address,
    label: config.label,
    instructions: config.instructions,
    enabled: config.enabled,
    is_default: settings.defaultCrypto === coin,
    deleted_at: null,
  }))
  if (wallets.length) {
    const walletResult = await supabase.from('crypto_wallets').upsert(wallets, { onConflict: 'organization_id,coin,network' })
    if (walletResult.error) throw walletResult.error
  }
}

export const platformPaymentStore = {
  get: () => cache.get(),
  snapshot: cache.snapshot,
  hydrate: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    try {
      const organizationId = requireOrganizationId()
      const [methodsResult, walletsResult] = await Promise.all([
        supabase.from('payment_methods').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('display_order'),
        supabase.from('crypto_wallets').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('created_at'),
      ])
      if (methodsResult.error) throw methodsResult.error
      if (walletsResult.error) throw walletsResult.error
      const methods = methodsResult.data?.length
        ? methodsResult.data.map(row => ({ id: row.method as PaymentMethod, enabled: row.enabled, isDefault: row.is_default, order: row.display_order }))
        : cloneDefaults().methods
      const cryptocurrencies = walletsResult.data?.length
        ? Object.fromEntries(walletsResult.data.map(row => [row.coin, { enabled: row.enabled, address: row.wallet_address, network: row.network, label: row.label ?? row.coin, instructions: row.instructions ?? '' }]))
        : cloneDefaults().cryptocurrencies
      const settings = {
        methods,
        cryptocurrencies,
        defaultCrypto: walletsResult.data?.find(row => row.is_default)?.coin ?? 'bitcoin',
      }
      cache.set(settings)
      return settings
    } catch (error) {
      cache.fail(error)
      throw error
    }
  },
  save: (settings: PlatformPaymentSettings) => {
    void cache.optimistic(settings, () => persist(settings)).catch(() => undefined)
  },
  subscribe: cache.subscribe,
  enabledMethods: () => cache.get().methods.filter(method => method.enabled).sort((a, b) => a.order - b.order),
  enabledCoins: () => Object.fromEntries(Object.entries(cache.get().cryptocurrencies).filter(([, coin]) => coin.enabled && coin.address.trim() !== '')),
  getDefaultMethod: (): PaymentMethod => cache.get().methods.find(method => method.isDefault && method.enabled)?.id ?? 'apple_gift_card',
  clear: cache.reset,
}

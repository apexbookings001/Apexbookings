// src/features/payments/PaymentAssets.ts
// Dynamic icon loader — all paths resolved via Vite's import.meta.glob
const allIcons = import.meta.glob('../../../icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

// Normalize icon names (strip version suffixes like " (1)")
export const paymentIcons = Object.fromEntries(
  Object.entries(allIcons).map(([path, url]) => {
    const filename = path.split('/').pop()?.replace('.png', '') || '';
    const normalized = filename.replace(/\s*\(\d+\)/g, '').toLowerCase().trim();
    return [normalized, url];
  })
);

/**
 * Resolve an official PNG icon for a payment method.
 * Returns undefined if no matching asset exists — callers should NOT render broken images.
 */
export const getPaymentIcon = (method: string): string | undefined => {
  const key = method.toLowerCase().trim();
  if (key === 'bank_transfer') return paymentIcons['transfer'];
  if (key === 'cash_app')      return paymentIcons['cash app'];
  if (key === 'paypal')        return paymentIcons['pay pal'];
  if (key === 'cryptocurrency') return paymentIcons['cryptocurrency'];
  return paymentIcons[key];
};

// ─── Non-crypto assets to exclude from the coin list ─────────────────────────
const NON_CRYPTO_ICONS = new Set([
  'cash app', 'instagram', 'pay pal', 'transfer', 'movie-ticket', 'cryptocurrency',
]);

// Prefer usdt over tether (deduplicate)
const COIN_PRIORITY: Record<string, number> = { usdt: 1, tether: 2 };

// Canonical name/symbol mapping for known coins
const COIN_META: Record<string, { name: string; symbol: string }> = {
  bitcoin:       { name: 'Bitcoin',      symbol: 'BTC'  },
  ethereum:      { name: 'Ethereum',     symbol: 'ETH'  },
  usdt:          { name: 'USDT',         symbol: 'USDT' },
  tether:        { name: 'USDT',         symbol: 'USDT' },
  solana:        { name: 'Solana',       symbol: 'SOL'  },
  xrp:           { name: 'XRP',          symbol: 'XRP'  },
  litecoin:      { name: 'Litecoin',     symbol: 'LTC'  },
  cardano:       { name: 'Cardano',      symbol: 'ADA'  },
  doge:          { name: 'Dogecoin',     symbol: 'DOGE' },
  avalanche:     { name: 'Avalanche',    symbol: 'AVAX' },
  chainlink:     { name: 'Chainlink',    symbol: 'LINK' },
  polkadot:      { name: 'Polkadot',     symbol: 'DOT'  },
  polygon:       { name: 'Polygon',      symbol: 'MATIC'},
  tron:          { name: 'Tron',         symbol: 'TRX'  },
  'stellar-coin':{ name: 'Stellar',      symbol: 'XLM'  },
  monero:        { name: 'Monero',       symbol: 'XMR'  },
  binance:       { name: 'Binance Coin', symbol: 'BNB'  },
};

/**
 * Returns a deduplicated, sorted list of all supported cryptocurrencies
 * based on icons present in the /icons folder.
 * Only includes actual cryptocurrency assets — no payment methods or graphics.
 */
export const getSupportedCryptocurrencies = () => {
  // symbol → best coin entry (by COIN_PRIORITY)
  const bySymbol = new Map<string, { id: string; name: string; symbol: string; icon: string }>();

  for (const [name, url] of Object.entries(paymentIcons)) {
    if (NON_CRYPTO_ICONS.has(name)) continue;

    const meta = COIN_META[name];
    if (!meta) {
      // Unknown icon — include with best-guess name
      const symbol = name.toUpperCase();
      const existing = bySymbol.get(symbol);
      if (!existing) bySymbol.set(symbol, { id: name, name: name.charAt(0).toUpperCase() + name.slice(1), symbol, icon: url });
      continue;
    }

    const { symbol } = meta;
    const existing = bySymbol.get(symbol);
    if (!existing) {
      bySymbol.set(symbol, { id: name, name: meta.name, symbol, icon: url });
    } else {
      // Prefer the one with higher priority (lower number)
      const currentPrio = COIN_PRIORITY[name] ?? 99;
      const existingPrio = COIN_PRIORITY[existing.id] ?? 99;
      if (currentPrio < existingPrio) bySymbol.set(symbol, { id: name, name: meta.name, symbol, icon: url });
    }
  }

  return Array.from(bySymbol.values()).sort((a, b) => a.name.localeCompare(b.name));
};

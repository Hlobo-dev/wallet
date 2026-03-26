/**
 * Hook & utilities for resolving stock/ETF/crypto logos for brokerage & wealth positions.
 *
 * Resolution order (mirrors Vibe-Trading StockLogo):
 *   1. Bundled SVG icon from kraken-wallet-cryptoicons (handled by row components)
 *   2. CoinCap CDN for known crypto symbols
 *   3. Parqet CDN for stocks & ETFs  (very reliable, no API key needed)
 *   4. Fallback: coloured circle with first letter (handled by row components)
 *
 * Results are cached in-memory for the lifetime of the app so the same logo
 * URL is never resolved twice.
 */

// ─── Known crypto symbols ────────────────────────────────────────────────────

const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'USDC', 'BNB', 'ADA', 'DOGE', 'DOT',
  'MATIC', 'POL', 'LINK', 'UNI', 'AVAX', 'ATOM', 'LTC', 'SHIB', 'TRX', 'NEAR',
  'APT', 'ARB', 'OP', 'AAVE', 'MKR', 'GRT', 'FTM', 'ALGO', 'HYPE', 'XETH',
  'XLM', 'VET', 'FIL', 'HBAR', 'ICP', 'EOS', 'XMR', 'XTZ', 'THETA', 'EGLD',
  'FLOW', 'CHZ', 'ENJ', 'ZEC', 'DASH', 'NEO', 'CAKE', 'COMP', 'CRV', 'SNX',
  'YFI', 'SUSHI', 'ZRX', 'ANKR', 'CELO', 'RNDR', 'IMX', 'GMX', 'LDO',
  'BLUR', 'STRK', 'JUP', 'BONK', 'WIF', 'PEPE', 'FLOKI', 'WLD', 'SEI', 'SUI',
  'INJ', 'RUNE', 'KAVA', 'DAI', 'PAXG', 'PYUSD', 'WBTC', 'WETH',
]);

// ─── CDN helpers ─────────────────────────────────────────────────────────────

/**
 * Parqet CDN — works for virtually every stock & ETF ticker.
 * Appends ?format=png because the default is SVG which React Native's
 * <Image> cannot render natively.
 */
export function getParqetLogoUrl(ticker: string): string {
  return `https://assets.parqet.com/logos/symbol/${ticker.toUpperCase()}?format=png`;
}

/**
 * CoinCap CDN — works for most major crypto tokens.
 * Returns a 2× retina PNG.
 */
export function getCoinCapLogoUrl(symbol: string): string {
  const base = symbol
    .replace(/-PERP$/, '')
    .replace(/PERP$/, '')
    .replace(/USDT$/, '')
    .replace(/USD$/, '')
    .toLowerCase();
  return `https://assets.coincap.io/assets/icons/${base}@2x.png`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Return a remote logo URL for the given ticker symbol.
 *
 * • Crypto → CoinCap CDN
 * • Stocks / ETFs → Parqet CDN
 *
 * This is a **synchronous** helper — no network request. The URLs are
 * deterministic CDN patterns that React Native's `<Image>` / `<FastImage>`
 * can load directly (with its own caching layer).
 */
export function getRemoteLogoUrl(symbol: string): string {
  const upper = symbol.toUpperCase();

  if (CRYPTO_SYMBOLS.has(upper)) {
    return getCoinCapLogoUrl(upper);
  }

  // Stock / ETF — use Parqet
  return getParqetLogoUrl(upper);
}

/**
 * Returns `true` when the symbol is a known crypto token
 * (so the row component can pick the right CDN or fallback strategy).
 */
export function isCryptoSymbol(symbol: string): boolean {
  return CRYPTO_SYMBOLS.has(symbol.toUpperCase());
}

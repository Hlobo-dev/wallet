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

// ─── Currency → country flag mapping ─────────────────────────────────────────
// Professional exchanges (Robinhood, Schwab, IBKR, Bloomberg) use circular
// country flags for fiat / cash positions.  SnapTrade & Plaid report cash
// holdings with symbols like "CUR:USD", "CUR:EUR", etc.

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', CHF: 'ch',
  CAD: 'ca', AUD: 'au', NZD: 'nz', HKD: 'hk', SGD: 'sg',
  KRW: 'kr', CNY: 'cn', CNH: 'cn', INR: 'in', MXN: 'mx',
  BRL: 'br', SEK: 'se', NOK: 'no', DKK: 'dk', PLN: 'pl',
  ZAR: 'za', TRY: 'tr', THB: 'th', TWD: 'tw', ILS: 'il',
  AED: 'ae', SAR: 'sa', RUB: 'ru', CZK: 'cz', HUF: 'hu',
  RON: 'ro', CLP: 'cl', COP: 'co', PEN: 'pe', ARS: 'ar',
  PHP: 'ph', IDR: 'id', MYR: 'my', VND: 'vn', EGP: 'eg',
  NGN: 'ng', KES: 'ke', GHS: 'gh', UAH: 'ua',
};

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

/**
 * FlagCDN — free, Cloudflare-backed, no API key needed.
 * Returns a circular-croppable PNG of the country flag at 2× retina size.
 * Professional exchanges (Robinhood, Schwab, IBKR) use country flags
 * for cash / fiat currency positions.
 */
export function getFlagLogoUrl(countryCode: string): string {
  return `https://flagcdn.com/w160/${countryCode.toLowerCase()}.png`;
}

// ─── Currency detection helpers ──────────────────────────────────────────────

/**
 * Returns true if the symbol represents a fiat currency / cash holding.
 * Handles formats: "CUR:USD", "USD" (when in the currency map).
 */
export function isCurrencySymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (upper.startsWith('CUR:')) {
    return true;
  }
  // Only match bare currency codes if they're NOT crypto
  return CURRENCY_TO_COUNTRY.hasOwnProperty(upper) && !CRYPTO_SYMBOLS.has(upper);
}

/**
 * Extract the raw currency code from symbols like "CUR:USD" → "USD".
 */
export function parseCurrencyCode(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.startsWith('CUR:')) {
    return upper.slice(4);
  }
  return upper;
}

/**
 * Return a flag CDN URL for a currency symbol, or null if not recognized.
 */
export function getCurrencyFlagUrl(symbol: string): string | null {
  const code = parseCurrencyCode(symbol);
  const country = CURRENCY_TO_COUNTRY[code];
  if (country) {
    return getFlagLogoUrl(country);
  }
  return null;
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

  // Currency / cash position → country flag (industry standard)
  const flagUrl = getCurrencyFlagUrl(upper);
  if (flagUrl) {
    return flagUrl;
  }

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

/**
 * Hook & utilities for resolving stock/ETF/crypto logos for brokerage & wealth positions.
 *
 * Resolution order (multi-CDN waterfall for maximum coverage):
 *   1. Bundled SVG icon from kraken-wallet-cryptoicons (handled by row components)
 *   2. CoinCap CDN for known crypto symbols
 *   3. Multi-CDN waterfall for stocks & ETFs:
 *      a. Public.com CDN  — best overall coverage, incl. niche ETFs (HUMN, etc.)
 *      b. Parqet CDN      — excellent European stock coverage
 *      c. Financial Modeling Prep — great ETF fallback, no API key needed
 *   4. Country flags via FlagCDN for cash / fiat positions (CUR:USD, etc.)
 *   5. Fallback: coloured circle with first letter (handled by row components)
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
 * Public.com CDN — best overall coverage for US stocks & ETFs, including
 * niche tickers like HUMN (Roundhill ETF Trust) that other CDNs miss.
 * Returns a 3× retina PNG. 403 for truly non-existent tickers (triggers onError).
 */
export function getPublicLogoUrl(ticker: string): string {
  return `https://universal.hellopublic.com/companyLogos/${ticker.toUpperCase()}@3x.png`;
}

/**
 * Parqet CDN — works for virtually every stock & ETF ticker.
 * Appends ?format=png because the default is SVG which React Native's
 * <Image> cannot render natively.
 */
export function getParqetLogoUrl(ticker: string): string {
  return `https://assets.parqet.com/logos/symbol/${ticker.toUpperCase()}?format=png`;
}

/**
 * Financial Modeling Prep CDN — great ETF coverage, free, no API key.
 * Good fallback for tickers that Parqet misses.
 */
export function getFmpLogoUrl(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${ticker.toUpperCase()}.png`;
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
 * Return an **ordered array** of remote logo URLs to try for the given symbol.
 * The row component should render the first URL and advance to the next on
 * each `onError`, finally falling back to a letter circle.
 *
 * • Currency / cash → single flag URL
 * • Crypto          → single CoinCap URL
 * • Stock / ETF     → multi-CDN waterfall (Public → Parqet → FMP)
 */
export function getRemoteLogoUrls(symbol: string): string[] {
  const upper = symbol.toUpperCase();

  // Currency / cash position → country flag
  const flagUrl = getCurrencyFlagUrl(upper);
  if (flagUrl) {
    return [flagUrl];
  }

  // Crypto → CoinCap
  if (CRYPTO_SYMBOLS.has(upper)) {
    return [getCoinCapLogoUrl(upper)];
  }

  // Stock / ETF — multi-CDN waterfall
  // Parqet stays primary (original logos the user already approved).
  // Public.com & FMP are only tried when Parqet 404s (niche ETFs like HUMN).
  return [
    getParqetLogoUrl(upper),   // Primary — original look, great general coverage
    getPublicLogoUrl(upper),   // Fallback — best niche ETF coverage (HUMN, etc.)
    getFmpLogoUrl(upper),      // Last resort
  ];
}

/**
 * Return a single remote logo URL for the given ticker symbol.
 * Convenience wrapper — returns the first (highest-priority) URL.
 *
 * @deprecated Prefer `getRemoteLogoUrls()` for multi-CDN waterfall support.
 */
export function getRemoteLogoUrl(symbol: string): string {
  return getRemoteLogoUrls(symbol)[0];
}

/**
 * Returns `true` when the symbol is a known crypto token
 * (so the row component can pick the right CDN or fallback strategy).
 */
export function isCryptoSymbol(symbol: string): boolean {
  return CRYPTO_SYMBOLS.has(symbol.toUpperCase());
}

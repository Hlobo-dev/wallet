/**
 * Hook that fetches investment holdings from connected wealth accounts (Plaid).
 *
 * Wealth accounts (Morgan Stanley, Goldman Sachs, etc.) are connected via Plaid
 * on the platform and share data with the mobile app via the same Google/platform
 * account.
 *
 * Uses:
 *   1. useNubleAuth().getAccessToken()  → platform JWT for Plaid API auth
 *   2. getPlaidClient().getHoldings()   → all investment holdings across connections
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getPlaidClient } from '@/services/plaid';
import type { PlaidHolding } from '@/services/plaid';
import { useNubleAuth } from '@/providers/NubleAuthProvider';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WealthHolding {
  /** Unique key for list rendering */
  key: string;
  /** Ticker symbol, e.g. "AAPL" or "VTI" */
  symbol: string;
  /**
   * Actual stock/ETF ticker for Polygon price lookups.
   * For crypto trusts (e.g. Grayscale ETHE) Plaid returns the underlying crypto
   * symbol ("ETH") which would fetch the wrong live price. `tickerSymbol`
   * holds the real tradeable ticker so that Polygon returns the correct price.
   * Falls back to `symbol` when no override is needed.
   */
  tickerSymbol: string;
  /** Full name, e.g. "Apple Inc" or "Vanguard Total Stock Market ETF" */
  name: string;
  /** Security type: equity, etf, mutual fund, fixed income, etc. */
  type: string;
  /** Current price per unit */
  price: number;
  /** Cost basis per unit (if available) */
  costBasis: number | null;
  /** Number of shares/units */
  quantity: number;
  /** Current market value */
  currentValue: number;
  /** Unrealised P&L in USD */
  unrealizedPnl: number | null;
  /** Unrealised P&L as a percentage */
  unrealizedPnlPercent: number | null;
  /** ISO currency code */
  currency: string;
  /** Source institution name, e.g. "Morgan Stanley" */
  institution: string;
  /** Plaid item ID (for grouping by connection) */
  itemId: string;
  /** Background color for the logo fallback circle */
  bgColor: string;
}

// ─── Crypto trust ticker overrides ────────────────────────────────────────────

/**
 * Plaid often returns the underlying crypto ticker (e.g. "ETH") for crypto
 * investment trusts instead of the real stock ticker (e.g. "ETHE").
 * This map resolves the correct tradeable ticker so that Polygon returns the
 * right live price and the quantity label shows the trust symbol, not the
 * crypto symbol.
 *
 * Key: `<plaid symbol>__<name substring>` (lowercased) → real ticker.
 */
const CRYPTO_TRUST_OVERRIDES: { plaidSymbol: string; namePattern: string; realTicker: string }[] = [
  // Grayscale Trusts
  { plaidSymbol: 'ETH', namePattern: 'grayscale ethereum', realTicker: 'ETHE' },
  { plaidSymbol: 'BTC', namePattern: 'grayscale bitcoin', realTicker: 'GBTC' },
  { plaidSymbol: 'SOL', namePattern: 'grayscale solana', realTicker: 'GSOL' },
  { plaidSymbol: 'AVAX', namePattern: 'grayscale avalanche', realTicker: 'AVAX' },
  { plaidSymbol: 'LINK', namePattern: 'grayscale chainlink', realTicker: 'GLNK' },
  { plaidSymbol: 'XLM', namePattern: 'grayscale stellar', realTicker: 'GXLM' },
  { plaidSymbol: 'LTC', namePattern: 'grayscale litecoin', realTicker: 'LTCN' },
  { plaidSymbol: 'ETC', namePattern: 'grayscale ethereum classic', realTicker: 'ETCG' },
  // Bitwise / 21Shares / other crypto ETFs
  { plaidSymbol: 'BTC', namePattern: 'ishares bitcoin', realTicker: 'IBIT' },
  { plaidSymbol: 'BTC', namePattern: 'fidelity wise origin bitcoin', realTicker: 'FBTC' },
  { plaidSymbol: 'ETH', namePattern: 'ishares ethereum', realTicker: 'ETHA' },
  { plaidSymbol: 'BTC', namePattern: 'bitwise bitcoin', realTicker: 'BITB' },
  { plaidSymbol: 'BTC', namePattern: 'ark 21shares bitcoin', realTicker: 'ARKB' },
];

/**
 * If Plaid returned a crypto symbol for a trust/ETF, resolve the real
 * tradeable ticker. Returns `undefined` if no override applies.
 */
function resolveCryptoTrustTicker(plaidSymbol: string, name: string): string | undefined {
  const upperSym = plaidSymbol.toUpperCase();
  const lowerName = name.toLowerCase();
  for (const o of CRYPTO_TRUST_OVERRIDES) {
    if (o.plaidSymbol === upperSym && lowerName.includes(o.namePattern)) {
      return o.realTicker;
    }
  }
  return undefined;
}

// ─── Asset name map for common tickers ────────────────────────────────────────

const ASSET_NAMES: Record<string, string> = {
  // ETFs
  VTI: 'Vanguard Total Stock Market ETF',
  VOO: 'Vanguard S&P 500 ETF',
  SPY: 'SPDR S&P 500 ETF',
  QQQ: 'Invesco QQQ Trust',
  IVV: 'iShares Core S&P 500 ETF',
  VEA: 'Vanguard FTSE Developed Markets ETF',
  VWO: 'Vanguard FTSE Emerging Markets ETF',
  BND: 'Vanguard Total Bond Market ETF',
  AGG: 'iShares Core US Aggregate Bond ETF',
  GLD: 'SPDR Gold Shares',
  VNQ: 'Vanguard Real Estate ETF',
  SCHD: 'Schwab US Dividend Equity ETF',
  // Stocks
  AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corp',
  GOOGL: 'Alphabet Inc',
  AMZN: 'Amazon.com Inc',
  NVDA: 'NVIDIA Corp',
  META: 'Meta Platforms',
  TSLA: 'Tesla Inc',
  BRK: 'Berkshire Hathaway',
  JPM: 'JPMorgan Chase',
  JNJ: 'Johnson & Johnson',
  V: 'Visa Inc',
  PG: 'Procter & Gamble',
  UNH: 'UnitedHealth Group',
  HD: 'Home Depot',
  MA: 'Mastercard',
  DIS: 'Walt Disney',
  NFLX: 'Netflix Inc',
  AMD: 'AMD Inc',
  PLTR: 'Palantir Technologies',
  AAL: 'American Airlines',
  SMCI: 'Super Micro Computer',
  // Crypto trusts / ETFs
  ETHE: 'Grayscale Ethereum Trust',
  GBTC: 'Grayscale Bitcoin Trust',
  GSOL: 'Grayscale Solana Trust',
  GLNK: 'Grayscale Chainlink Trust',
  GXLM: 'Grayscale Stellar Trust',
  LTCN: 'Grayscale Litecoin Trust',
  ETCG: 'Grayscale Ethereum Classic Trust',
  IBIT: 'iShares Bitcoin Trust',
  FBTC: 'Fidelity Wise Origin Bitcoin Fund',
  ETHA: 'iShares Ethereum Trust',
  BITB: 'Bitwise Bitcoin ETF',
  ARKB: 'ARK 21Shares Bitcoin ETF',
};

// ─── Institution brand colors ─────────────────────────────────────────────────

const INSTITUTION_COLORS: Record<string, string> = {
  'morgan stanley': '#003986',
  'goldman sachs': '#6F9FD8',
  'merrill lynch': '#0060A9',
  'j.p. morgan': '#003A70',
  'jp morgan': '#003A70',
  'vanguard': '#952726',
  'ubs': '#E60000',
  'wells fargo': '#D71E28',
  'edward jones': '#2D6A4F',
  'charles schwab': '#00A0DF',
  'fidelity': '#4B8B3B',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_KEY = 'wealth_positions_cache';

function getAssetName(symbol: string, plaidName: string): string {
  const upper = symbol.toUpperCase();
  if (ASSET_NAMES[upper]) {
    return ASSET_NAMES[upper];
  }
  // Use the name from Plaid if available
  return plaidName || upper;
}

function getFallbackBgColor(symbol: string): string {
  const COLORS = ['#003986', '#6F9FD8', '#0060A9', '#952726', '#E60000', '#2D6A4F'];
  const idx = symbol.charCodeAt(0) % COLORS.length;
  return COLORS[idx];
}

function getInstitutionColor(institution: string): string {
  const lower = institution.toLowerCase();
  for (const [key, color] of Object.entries(INSTITUTION_COLORS)) {
    if (lower.includes(key)) {
      return color;
    }
  }
  return getFallbackBgColor(institution);
}

async function loadCache(): Promise<WealthHolding[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveCache(holdings: WealthHolding[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(holdings));
  } catch {
    // ignore
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Polling interval for live wealth position updates (30 seconds). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Minimum time between fetches — prevents hammering the API if multiple
 * triggers fire in quick succession (e.g. AppState + interval at the same time).
 */
const MIN_FETCH_GAP_MS = 10_000;

export function useWealthPositions() {
  const [holdings, setHoldings] = useState<WealthHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);
  const lastFetchAt = useRef(0);
  const isFetching = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { getAccessToken, isAuthenticated } = useNubleAuth();

  const fetchPositions = useCallback(async (silent = false) => {
    // Throttle: skip if another fetch is already in-flight or was too recent
    const now = Date.now();
    if (isFetching.current) {
      return;
    }
    if (now - lastFetchAt.current < MIN_FETCH_GAP_MS) {
      return;
    }
    isFetching.current = true;
    if (!silent) {
      setIsLoading(true);
    }

    try {
      // Get platform auth token
      const token = await getAccessToken();
      if (!token) {
        console.log('[useWealthPositions] No platform auth token available');
        setIsLoading(false);
        isFetching.current = false;
        lastFetchAt.current = Date.now();
        return;
      }

      // Set the token on the Plaid client so it can authenticate
      const client = getPlaidClient();
      client.setAuthToken(token);

      // Fetch all holdings across all Plaid connections
      const result = await client.getHoldings();

      if (!result.success || !result.data) {
        console.warn('[useWealthPositions] getHoldings failed:', result.error);
        // Don't clear existing holdings — keep cache
        setIsLoading(false);
        isFetching.current = false;
        lastFetchAt.current = Date.now();
        return;
      }

      const { holdings: plaidHoldings } = result.data;
      console.log(`[useWealthPositions] Fetched ${plaidHoldings.length} wealth holding(s) from ${result.data.connectionCount} connection(s)`);

      // Map Plaid holdings to our WealthHolding type
      const mapped: WealthHolding[] = plaidHoldings
        .filter(h => h.quantity > 0) // Only show positions with quantity > 0
        .map((h: PlaidHolding, index: number): WealthHolding => {
          const pnl = h.unrealizedPnL ?? (h.costBasis ? h.currentValue - h.costBasis : null);
          const pnlPct = h.unrealizedPnLPercent ?? (h.costBasis && h.costBasis > 0 ? ((h.currentValue - h.costBasis) / h.costBasis) * 100 : null);

          // Resolve the real stock ticker if Plaid returned a crypto symbol for a trust/ETF
          const realTicker = resolveCryptoTrustTicker(h.symbol, h.name);
          const displaySymbol = realTicker ?? h.symbol;

          return {
            key: `wealth_${h.itemId}_${h.securityId}_${index}`,
            symbol: displaySymbol || 'N/A',
            tickerSymbol: displaySymbol || h.symbol || 'N/A',
            name: getAssetName(displaySymbol, h.name),
            type: h.type || 'equity',
            price: h.closePrice ?? (h.quantity > 0 ? h.currentValue / h.quantity : 0),
            costBasis: h.costBasis,
            quantity: h.quantity,
            currentValue: h.currentValue,
            unrealizedPnl: pnl,
            unrealizedPnlPercent: pnlPct,
            currency: h.isoCurrencyCode || 'USD',
            institution: h.institution || 'Wealth Account',
            itemId: h.itemId,
            bgColor: getInstitutionColor(h.institution || ''),
          };
        });

      // Sort by value descending
      mapped.sort((a, b) => b.currentValue - a.currentValue);

      if (mapped.length > 0) {
        setHoldings(mapped);
        saveCache(mapped);
      } else {
        console.log('[useWealthPositions] Live fetch returned 0 holdings, keeping existing data');
      }
    } catch (e) {
      console.error('[useWealthPositions] Error:', e);
      // On error, keep existing data
    }

    setIsLoading(false);
    isFetching.current = false;
    lastFetchAt.current = Date.now();
  }, [getAccessToken]);

  // ── Initial load: cache → live fetch ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await loadCache();
      if (!cancelled && cached.length > 0) {
        setHoldings(cached);
        setIsLoading(false);
      }

      if (!fetchedRef.current && isAuthenticated) {
        fetchedRef.current = true;
        await fetchPositions();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPositions, isAuthenticated]);

  // ── Foreground polling: refresh every 30s while the app is active ─────────
  useEffect(() => {
    if (!isAuthenticated) {
      return; // Don't poll until authenticated
    }

    const startPolling = () => {
      if (pollTimer.current) {
        return; // already polling
      }
      pollTimer.current = setInterval(() => {
        fetchPositions(true); // silent — no loading spinner
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    // Start polling immediately (app is in foreground)
    startPolling();

    // Listen for AppState changes — pause polling when backgrounded,
    // resume + do an immediate fetch when foregrounded.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchPositions(true); // immediate silent refresh on foreground
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [fetchPositions, isAuthenticated]);

  return { holdings, isLoading, refetch: fetchPositions };
}

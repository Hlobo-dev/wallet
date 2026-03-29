/**
 * Hook that fetches actual positions/holdings from all connected brokerage accounts.
 *
 * Uses the SnapTrade service — calls getAllHoldings() which returns all positions,
 * balances, and accounts from every connected brokerage in one API call.
 *
 * Falls back to per-account getPositions() if getAllHoldings() fails.
 *
 * The SnapTrade credentials (userId + userSecret) are stored in AsyncStorage
 * and automatically included in every request by the SnapTradeClientService.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSnapTradeClient } from '@/services/snaptrade';
import type { BrokerageAccount, Position, SnapTradeSymbol } from '@/services/snaptrade';
import { scopedKey, getCurrentUserId, USER_SCOPED_KEYS } from '@/utils/userScopedStorage';
import { useAstellrAuth } from '@/providers/AstellrAuthProvider';

// ─── Asset name map ──────────────────────────────────────────────────────────

const ASSET_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  DOGE: 'Dogecoin',
  XRP: 'Ripple',
  ADA: 'Cardano',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  MATIC: 'Polygon',
  POL: 'Polygon',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  LTC: 'Litecoin',
  HYPE: 'Hyperliquid',
  XETH: 'Ethereum',
  TSLA: 'Tesla Inc',
  AAPL: 'Apple Inc',
  GOOGL: 'Alphabet Inc',
  AMZN: 'Amazon.com Inc',
  MSFT: 'Microsoft Corp',
  META: 'Meta Platforms',
  NVDA: 'NVIDIA Corp',
  AMD: 'AMD Inc',
  SPY: 'SPDR S&P 500 ETF',
  QQQ: 'Invesco QQQ Trust',
  GNW: 'Genworth Financial',
  SHIB: 'Shiba Inu',
  PEPE: 'Pepe',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  USDT: 'Tether',
  USDC: 'USD Coin',
  BNB: 'BNB',
  BONK: 'Bonk',
  WIF: 'dogwifhat',
  NEAR: 'NEAR Protocol',
  FTM: 'Fantom',
  ALGO: 'Algorand',
  AAVE: 'Aave',
  MKR: 'Maker',
  COMP: 'Compound',
  CRV: 'Curve DAO',
  SNX: 'Synthetix',
  GRT: 'The Graph',
  ENJ: 'Enjin Coin',
  IMX: 'Immutable X',
  LDO: 'Lido DAO',
  RNDR: 'Render Token',
  INJ: 'Injective',
  SUI: 'Sui',
  SEI: 'Sei',
  NFLX: 'Netflix Inc.',
  AAL: 'American Airlines Group Inc',
  SMCI: 'Super Micro Computer Inc',
  PLTR: 'Palantir Technologies Inc.',
};

// ─── Known crypto symbols (for isCrypto flag) ─────────────────────────────────

const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'USDC', 'BNB', 'ADA', 'DOGE', 'DOT',
  'MATIC', 'POL', 'LINK', 'UNI', 'AVAX', 'ATOM', 'LTC', 'SHIB', 'TRX', 'NEAR', 'APT',
  'ARB', 'OP', 'AAVE', 'MKR', 'GRT', 'FTM', 'ALGO', 'HYPE', 'XETH', 'XLM',
  'VET', 'FIL', 'HBAR', 'ICP', 'EOS', 'XMR', 'XTZ', 'THETA', 'EGLD', 'FLOW',
  'CHZ', 'ENJ', 'ZEC', 'DASH', 'NEO', 'CAKE', 'COMP', 'CRV', 'SNX',
  'YFI', 'SUSHI', 'ZRX', 'ANKR', 'CELO', 'RNDR', 'IMX', 'GMX', 'LDO',
  'BLUR', 'STRK', 'JUP', 'BONK', 'WIF', 'PEPE', 'FLOKI', 'WLD', 'SEI', 'SUI',
  'INJ', 'RUNE', 'KAVA', 'DAI', 'PAXG', 'PYUSD', 'WBTC', 'WETH',
]);

// ─── Brand colors ─────────────────────────────────────────────────────────────

export const CRYPTO_BG_COLORS: Record<string, string> = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SOL: '#9945ff',
  XRP: '#23292f',
  DOGE: '#c2a633',
  ADA: '#0033ad',
  BNB: '#f3ba2f',
  DOT: '#e6007a',
  MATIC: '#8247e5',
  POL: '#8247e5',
  LINK: '#2a5ada',
  UNI: '#ff007a',
  AVAX: '#e84142',
  ATOM: '#2e3148',
  LTC: '#345d9d',
  SHIB: '#ffa409',
  TRX: '#eb0a29',
  NEAR: '#000000',
  APT: '#000000',
  ARB: '#28a0f0',
  OP: '#ff0420',
  AAVE: '#b6509e',
  MKR: '#1aab9b',
  GRT: '#6747ed',
  FTM: '#1969ff',
  USDT: '#26a17b',
  USDC: '#2775ca',
  HYPE: '#00d1ff',
  XETH: '#627eea',
};

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BrokerageHolding {
  /** Unique key for list rendering */
  key: string;
  /** Cleaned-up ticker symbol, e.g. "BTC" or "TSLA" */
  symbol: string;
  /** Human-readable name, e.g. "Bitcoin" or "Tesla Inc" */
  name: string;
  /** Whether this is a cryptocurrency */
  isCrypto: boolean;
  /** Current price per unit */
  price: number;
  /** Average purchase price */
  averageCost: number;
  /** Number of shares/units */
  units: number;
  /** Market value = price × units */
  value: number;
  /** Unrealised P&L in USD */
  unrealizedPnl: number;
  /** Unrealised P&L as a percentage */
  unrealizedPnlPercent: number;
  /** 24h change percent */
  change24h: number;
  /** Source brokerage account id */
  accountId: string;
  /** Source brokerage account display name */
  accountName: string;
  /** Background color for the logo fallback circle */
  bgColor: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_BASE_KEY = USER_SCOPED_KEYS.BROKERAGE_POSITIONS_CACHE;

/**
 * Extract base symbol from various formats:
 *   X:ETHUSD → ETH, ETH-PERP → ETH, ETHUSDT → ETH, XETH → ETH
 */
function extractBaseSymbol(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    return '';
  }
  let s = raw
    .replace('X:', '')
    .replace(/-USD$/, '')
    .replace(/-PERP$/, '')
    .replace(/PERP$/, '')
    .replace(/USDT$/, '')
    .replace(/USD$/, '')
    .toUpperCase();

  // Hyperliquid format: XETH → ETH
  if (s.startsWith('X') && s.length > 1 && CRYPTO_SYMBOLS.has(s.slice(1))) {
    s = s.slice(1);
  }

  return s;
}

/**
 * Extract the raw symbol string from a Position's symbol field.
 * The backend may return symbol as a string OR as a SnapTradeSymbol object:
 *   { id, symbol, rawSymbol, description, type, ... }
 */
function resolveSymbolString(sym: string | SnapTradeSymbol): string {
  if (!sym) {
    return '';
  }
  if (typeof sym === 'string') {
    return sym;
  }
  // It's a SnapTradeSymbol object — prefer rawSymbol, then symbol
  // symbol may itself be a nested object (e.g. Kraken), so drill down
  const inner = sym.rawSymbol || sym.symbol;
  if (typeof inner === 'string') {
    return inner;
  }
  if (inner && typeof inner === 'object') {
    // Nested symbol object: { symbol: "XETH", raw_symbol: "XETH", ... }
    return (inner as any).raw_symbol || (inner as any).rawSymbol || (inner as any).symbol || '';
  }
  return '';
}

/**
 * Extract a human-readable description from a SnapTradeSymbol object if available.
 */
function resolveSymbolDescription(sym: string | SnapTradeSymbol): string | undefined {
  if (typeof sym === 'object' && sym) {
    if (sym.description) {
      return sym.description;
    }
    // Nested symbol object
    const inner = sym.symbol;
    if (inner && typeof inner === 'object' && (inner as any).description) {
      return (inner as any).description;
    }
  }
  return undefined;
}

/**
 * Determine the security type from a SnapTradeSymbol object.
 * Returns 'cs' (common stock), 'crypto', 'etf', etc.
 */
function resolveSymbolType(sym: string | SnapTradeSymbol): string | undefined {
  if (typeof sym === 'object' && sym) {
    if (sym.type) {
      return typeof sym.type === 'string' ? sym.type : undefined;
    }
    // Nested symbol object: look for type.code (e.g. "crypto", "cs")
    const inner = sym.symbol;
    if (inner && typeof inner === 'object') {
      const innerType = (inner as any).type;
      if (typeof innerType === 'string') {
        return innerType;
      }
      if (innerType && typeof innerType === 'object' && innerType.code) {
        return innerType.code;
      }
    }
  }
  return undefined;
}

function isKnownCrypto(symbol: string): boolean {
  return CRYPTO_SYMBOLS.has(extractBaseSymbol(symbol));
}

function getAssetName(symbol: string): string {
  const base = extractBaseSymbol(symbol);
  if (ASSET_NAMES[base]) {
    return ASSET_NAMES[base];
  }
  return base;
}

function getFallbackBgColor(symbol: string): string {
  const base = extractBaseSymbol(symbol);
  if (CRYPTO_BG_COLORS[base]) {
    return CRYPTO_BG_COLORS[base];
  }
  const colors = ['#627EEA', '#F7931A', '#9945FF', '#4285F4', '#00D632', '#FF6A00'];
  const idx = (base.length > 0 ? base.charCodeAt(0) : 0) % colors.length;
  return colors[idx];
}

async function loadCache(): Promise<BrokerageHolding[]> {
  try {
    const userId = await getCurrentUserId();
    const key = scopedKey(CACHE_BASE_KEY, userId);
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveCache(holdings: BrokerageHolding[]): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    const key = scopedKey(CACHE_BASE_KEY, userId);
    await AsyncStorage.setItem(key, JSON.stringify(holdings));
  } catch {
    // ignore
  }
}

// ─── Institutions classified as "wealth" (not brokerage) ──────────────────────
// Positions from these institutions go to the Wealth section via Plaid,
// so we exclude them from the SnapTrade brokerage fetch to avoid duplicates.
const WEALTH_INSTITUTIONS = new Set([
  'morgan stanley',
  'jp morgan',
  'jpmorgan',
  'goldman sachs',
  'merrill lynch',
  'merrill',
  'ubs',
  'wells fargo advisors',
  'edward jones',
  'charles schwab',
  'fidelity',
  'vanguard',
]);

function isWealthInstitution(name: string): boolean {
  const lower = name.toLowerCase();
  for (const inst of WEALTH_INSTITUTIONS) {
    if (lower.includes(inst)) {
      return true;
    }
  }
  return false;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Polling interval for live position updates (30 seconds). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Minimum time between fetches — prevents hammering the API if multiple
 * triggers fire in quick succession (e.g. AppState + interval at the same time).
 */
const MIN_FETCH_GAP_MS = 10_000;

export function useBrokeragePositions() {
  const [holdings, setHoldings] = useState<BrokerageHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);
  const lastFetchAt = useRef(0);
  const isFetching = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { user } = useAstellrAuth();
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);

  // ── Reset state when user changes (multi-user isolation) ─────────────────
  useEffect(() => {
    const newUserId = user?.id ?? null;
    if (currentUserIdRef.current !== newUserId) {
      console.log(`[useBrokeragePositions] User changed: ${currentUserIdRef.current} → ${newUserId}`);
      currentUserIdRef.current = newUserId;
      // Clear in-memory state so previous user's positions don't flash
      setHoldings([]);
      setIsLoading(true);
      fetchedRef.current = false;
      lastFetchAt.current = 0;
      isFetching.current = false;
    }
  }, [user?.id]);

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

    const client = getSnapTradeClient();
    const allHoldings: BrokerageHolding[] = [];

    try {
      // Check if SnapTrade credentials exist (same check useConnectedAccounts does)
      if (!(await client.isRegistered())) {
        console.log('[useBrokeragePositions] SnapTrade not registered — no credentials');
        setHoldings([]);
        setIsLoading(false);
        isFetching.current = false;
        lastFetchAt.current = Date.now();
        return;
      }

      // List all brokerage accounts via SnapTrade
      const accountsResult = await client.listAccounts();
      if (!accountsResult.success || !accountsResult.data) {
        console.warn('[useBrokeragePositions] listAccounts failed:', accountsResult.error);
        setIsLoading(false);
        isFetching.current = false;
        lastFetchAt.current = Date.now();
        return;
      }

      const accounts: BrokerageAccount[] = accountsResult.data;
      console.log(`[useBrokeragePositions] Found ${accounts.length} account(s):`,
        accounts.map(a => `${a.institutionName} (${a.id})`));

      // Filter out wealth institutions — those are handled by the Plaid/wealth hook
      const brokerageAccounts = accounts.filter(a => {
        const name = a.institutionName || a.name || '';
        if (isWealthInstitution(name)) {
          console.log(`[useBrokeragePositions] Skipping wealth institution: ${name}`);
          return false;
        }
        return true;
      });

      console.log(`[useBrokeragePositions] Fetching positions for ${brokerageAccounts.length} brokerage account(s)`);

      // Fetch positions for each brokerage account in parallel
      const results = await Promise.allSettled(
        brokerageAccounts.map(async (account) => {
          const posResult = await client.getPositions(account.id);
          if (!posResult.success || !posResult.data) {
            console.warn(`[useBrokeragePositions] getPositions failed for ${account.institutionName}:`, posResult.error);
            return [];
          }

          console.log(`[useBrokeragePositions] ${account.institutionName}: ${posResult.data.length} position(s)`);

          const mapped = posResult.data.map((pos: Position, posIndex: number): BrokerageHolding => {
            const rawSymbol = resolveSymbolString(pos.symbol);
            const description = resolveSymbolDescription(pos.symbol);
            const symType = resolveSymbolType(pos.symbol);
            const baseSymbol = extractBaseSymbol(rawSymbol);
            const units = (pos.units ?? 0) + (pos.fractionalUnits ?? 0);
            const value = units * (pos.price ?? 0);
            const avgPrice = pos.averagePrice ?? 0;
            const costBasis = units * avgPrice;
            const pnl = pos.openPnl ?? (value - costBasis);
            const pnlPct = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : 0;

            const isCrypto = symType === 'cryptocurrency' || isKnownCrypto(rawSymbol);
            const name = description || getAssetName(rawSymbol);

            return {
              key: `brokerage_${account.id}_${rawSymbol}_${posIndex}`,
              symbol: baseSymbol,
              name,
              isCrypto,
              price: pos.price ?? 0,
              averageCost: avgPrice,
              units,
              value,
              unrealizedPnl: pnl,
              unrealizedPnlPercent: pnlPct,
              change24h: 0,
              accountId: account.id,
              accountName: account.institutionName ?? account.name,
              bgColor: getFallbackBgColor(baseSymbol),
            };
          });
          return mapped;
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allHoldings.push(...result.value);
        } else {
          console.error('[useBrokeragePositions] Promise rejected:', result.reason);
        }
      }

      // Sort by value descending (highest positions first)
      allHoldings.sort((a, b) => b.value - a.value);

      console.log(`[useBrokeragePositions] Total: ${allHoldings.length} holdings (${allHoldings.filter(h => h.isCrypto).length} crypto, ${allHoldings.filter(h => !h.isCrypto).length} stocks)`);
    } catch (e) {
      console.error('[useBrokeragePositions] Error:', e);
      // On error, keep whatever holdings we already have (cached or previous fetch)
      setIsLoading(false);
      isFetching.current = false;
      lastFetchAt.current = Date.now();
      return;
    }

    // Only update if we actually got results — never wipe out cached data with empty
    if (allHoldings.length > 0) {
      setHoldings(allHoldings);
      saveCache(allHoldings);
    } else {
      console.log('[useBrokeragePositions] Live fetch returned 0 positions, keeping existing data');
    }
    setIsLoading(false);
    isFetching.current = false;
    lastFetchAt.current = Date.now();
  }, []);

  // ── Initial load: cache → live fetch ──────────────────────────────────────
  // Re-runs when user changes (multi-user isolation) or fetchPositions changes.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await loadCache();
      if (!cancelled && cached.length > 0) {
        setHoldings(cached);
        setIsLoading(false);
      }

      if (!fetchedRef.current) {
        fetchedRef.current = true;
        await fetchPositions();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPositions, user?.id]);

  // ── Foreground polling: refresh every 30s while the app is active ─────────
  useEffect(() => {
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
  }, [fetchPositions]);

  return { holdings, isLoading, refetch: fetchPositions };
}

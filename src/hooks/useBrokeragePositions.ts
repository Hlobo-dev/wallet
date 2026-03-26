/**
 * Hook that fetches actual positions/holdings from all connected brokerage accounts.
 *
 * Uses the SnapTrade service — the same service that useConnectedAccounts uses
 * to show connected Kraken/Robinhood accounts in the Accounts screen:
 *   1. getSnapTradeClient().listAccounts() → list all brokerage accounts
 *   2. getSnapTradeClient().getPositions(accountId) → positions per account
 *
 * The SnapTrade credentials (userId + userSecret) are stored in AsyncStorage
 * and automatically included in every request by the SnapTradeClientService.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSnapTradeClient } from '@/services/snaptrade';
import type { BrokerageAccount, Position } from '@/services/snaptrade';

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

const CACHE_KEY = 'brokerage_positions_cache';

/**
 * Extract base symbol from various formats:
 *   X:ETHUSD → ETH, ETH-PERP → ETH, ETHUSDT → ETH, XETH → ETH
 */
function extractBaseSymbol(raw: string): string {
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
  const idx = base.charCodeAt(0) % colors.length;
  return colors[idx];
}

async function loadCache(): Promise<BrokerageHolding[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveCache(holdings: BrokerageHolding[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(holdings));
  } catch {
    // ignore
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBrokeragePositions() {
  const [holdings, setHoldings] = useState<BrokerageHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchPositions = useCallback(async () => {
    setIsLoading(true);

    const client = getSnapTradeClient();
    const allHoldings: BrokerageHolding[] = [];

    try {
      // Check if SnapTrade credentials exist (same check useConnectedAccounts does)
      if (!(await client.isRegistered())) {
        console.log('[useBrokeragePositions] SnapTrade not registered — no credentials');
        setHoldings([]);
        setIsLoading(false);
        return;
      }

      // 1. List all brokerage accounts via SnapTrade
      //    POST /api/snaptrade/accounts  (with userId + userSecret in body)
      const accountsResult = await client.listAccounts();
      if (!accountsResult.success || !accountsResult.data) {
        console.warn('[useBrokeragePositions] listAccounts failed:', accountsResult.error);
        // Don't clear existing holdings — keep cache
        setIsLoading(false);
        return;
      }

      const accounts: BrokerageAccount[] = accountsResult.data;
      console.log(`[useBrokeragePositions] Found ${accounts.length} account(s):`,
        accounts.map(a => `${a.institutionName} (${a.id})`));

      // 2. Fetch positions for each account in parallel
      //    POST /api/snaptrade/accounts/:accountId/positions  (with userId + userSecret)
      const results = await Promise.allSettled(
        accounts.map(async (account) => {
          const posResult = await client.getPositions(account.id);
          if (!posResult.success || !posResult.data) {
            console.warn(`[useBrokeragePositions] getPositions failed for ${account.institutionName}:`, posResult.error);
            return [];
          }

          console.log(`[useBrokeragePositions] ${account.institutionName}: ${posResult.data.length} position(s)`);

          return posResult.data.map((pos: Position, posIndex: number): BrokerageHolding => {
            const baseSymbol = extractBaseSymbol(pos.symbol);
            const units = pos.units + (pos.fractionalUnits ?? 0);
            const value = units * pos.price;
            const costBasis = units * pos.averagePrice;
            const pnl = pos.openPnl ?? (value - costBasis);
            const pnlPct = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : 0;

            return {
              key: `brokerage_${account.id}_${pos.symbol}_${posIndex}`,
              symbol: baseSymbol,
              name: getAssetName(pos.symbol),
              isCrypto: isKnownCrypto(pos.symbol),
              price: pos.price,
              averageCost: pos.averagePrice,
              units,
              value,
              unrealizedPnl: pnl,
              unrealizedPnlPercent: pnlPct,
              change24h: 0, // SnapTrade doesn't provide 24h change
              accountId: account.id,
              accountName: account.institutionName ?? account.name,
              bgColor: getFallbackBgColor(baseSymbol),
            };
          });
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allHoldings.push(...result.value);
        }
      }

      // Sort by value descending (highest positions first)
      allHoldings.sort((a, b) => b.value - a.value);
    } catch (e) {
      console.error('[useBrokeragePositions] Error:', e);
      // On error, keep whatever holdings we already have (cached or previous fetch)
      // instead of replacing with an empty array
      setIsLoading(false);
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
  }, []);

  // Load cache first, then live fetch
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
  }, [fetchPositions]);

  return { holdings, isLoading, refetch: fetchPositions };
}

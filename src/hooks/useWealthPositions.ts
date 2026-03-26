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

export function useWealthPositions() {
  const [holdings, setHoldings] = useState<WealthHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);
  const { getAccessToken, isAuthenticated } = useNubleAuth();

  const fetchPositions = useCallback(async () => {
    setIsLoading(true);

    try {
      // Get platform auth token
      const token = await getAccessToken();
      if (!token) {
        console.log('[useWealthPositions] No platform auth token available');
        setIsLoading(false);
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

          return {
            key: `wealth_${h.itemId}_${h.securityId}_${index}`,
            symbol: h.symbol || 'N/A',
            name: getAssetName(h.symbol, h.name),
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
  }, [getAccessToken]);

  // Load cache first, then live fetch
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

  return { holdings, isLoading, refetch: fetchPositions };
}

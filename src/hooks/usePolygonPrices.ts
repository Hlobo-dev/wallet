/**
 * usePolygonPrices — React hook for real-time Polygon.io market data
 *
 * Architecture:
 *   1. On mount: fetches snapshots via REST API (instant price + prevClose)
 *   2. Seeds the WebSocket price cache with prevClose data
 *   3. Connects WebSocket for real-time per-second aggregates
 *   4. Exposes a `prices` Map<symbol, LivePrice> that updates in real-time
 *   5. On unmount: cleans up subscriptions (WebSocket stays alive as singleton)
 *
 * Usage:
 *   const { prices, isConnected } = usePolygonPrices(['AAPL', 'TSLA', 'BTC']);
 *   const applePrice = prices.get('AAPL'); // { price, prevClose, change, changePercent, updatedAt }
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { polygonRestClient } from '@/services/polygon/polygonRestClient';
import { polygonWebSocket } from '@/services/polygon/polygonWebSocket';
import type { LivePrice } from '@/services/polygon/types';

export interface UsePolygonPricesResult {
  /** Live prices keyed by uppercase symbol */
  prices: Map<string, LivePrice>;
  /** Whether the WebSocket is configured (API key exists) */
  isConfigured: boolean;
}

/**
 * Hook that streams real-time prices from Polygon.io.
 *
 * @param symbols - Array of ticker symbols to track (e.g. ['AAPL', 'BTC', 'TSLA'])
 * @returns Live prices map + connection status
 */
export function usePolygonPrices(symbols: string[]): UsePolygonPricesResult {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(() => polygonWebSocket.getAllPrices());
  const symbolsKey = symbols.sort().join(',');
  const initialFetchDone = useRef(false);

  // ── Separate stock vs crypto symbols ──────────────────────────────────
  const { stockSymbols, cryptoSymbols } = useSplitSymbols(symbols);

  // ── Step 1: Fetch REST snapshots (prevClose + initial price) ──────────
  useEffect(() => {
    if (!polygonRestClient.isConfigured || symbols.length === 0) {
      return;
    }

    // Only do the initial REST fetch once per symbol set change
    let cancelled = false;

    (async () => {
      try {
        console.log(`[usePolygonPrices] Fetching snapshots for ${symbols.length} symbols...`);
        const snapshots = await polygonRestClient.getSnapshots(symbols);

        if (cancelled) {
          return;
        }

        if (snapshots.length > 0) {
          console.log(`[usePolygonPrices] Got ${snapshots.length} snapshots — seeding price cache`);

          // Seed the WebSocket price cache with prevClose data
          polygonWebSocket.seedPrevCloses(
            snapshots.map(s => ({
              symbol: s.symbol,
              prevClose: s.prevClose,
              price: s.price,
              changePercent: s.changePercent,
            })),
          );

          // Update React state with initial prices
          setPrices(polygonWebSocket.getAllPrices());
        }

        initialFetchDone.current = true;
      } catch (e) {
        console.warn('[usePolygonPrices] REST snapshot fetch failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // ── Step 2: Subscribe to WebSocket updates ────────────────────────────
  useEffect(() => {
    if (!polygonWebSocket.isConfigured || symbols.length === 0) {
      return;
    }

    // Set subscriptions (WebSocket will auto-subscribe/unsubscribe)
    polygonWebSocket.setSubscriptions(stockSymbols, cryptoSymbols);

    // Connect if not already connected
    polygonWebSocket.connect();

    // Listen for price updates
    const unsubscribe = polygonWebSocket.onPriceUpdate((updatedPrices) => {
      setPrices(new Map(updatedPrices));
    });

    return () => {
      unsubscribe();
      // NOTE: We do NOT disconnect the WebSocket here — it's a singleton.
      // It will disconnect when the app backgrounds (via AppState listener).
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return {
    prices,
    isConfigured: polygonWebSocket.isConfigured,
  };
}

// ─── Helper hook: split symbols into stock vs crypto ────────────────────────

const KNOWN_CRYPTO = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'DOT', 'AVAX', 'LINK',
  'MATIC', 'POL', 'UNI', 'ATOM', 'LTC', 'SHIB', 'TRX', 'NEAR', 'APT',
  'ARB', 'OP', 'AAVE', 'MKR', 'GRT', 'FTM', 'ALGO', 'HYPE', 'XETH',
  'BNB', 'USDT', 'USDC', 'BONK', 'WIF', 'PEPE', 'INJ', 'SUI', 'SEI',
  'COMP', 'CRV', 'SNX', 'LDO', 'RNDR', 'IMX', 'RUNE', 'DAI',
]);

function useSplitSymbols(symbols: string[]): { stockSymbols: string[]; cryptoSymbols: string[] } {
  // Use useCallback to avoid infinite re-renders
  const split = useCallback(() => {
    const stocks: string[] = [];
    const crypto: string[] = [];

    for (const sym of symbols) {
      const upper = sym.toUpperCase();
      // Skip currency positions (CUR:USD etc.)
      if (upper.startsWith('CUR:') || upper === 'USD' || upper === 'CAD') {
        continue;
      }
      if (KNOWN_CRYPTO.has(upper)) {
        crypto.push(upper);
      } else {
        stocks.push(upper);
      }
    }

    return { stockSymbols: stocks, cryptoSymbols: crypto };
  }, [symbols]);

  return split();
}

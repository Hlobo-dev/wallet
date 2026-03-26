/**
 * Polygon.io REST Client for React Native
 *
 * Fetches snapshots (price + prevClose + change%) for all held tickers
 * in a single batch request. Used to:
 *   1. Seed the price cache on first load (before WebSocket connects)
 *   2. Backfill prevClose data (WebSocket only streams live trades/aggs)
 *   3. Provide fallback when WebSocket is disconnected
 *
 * Endpoints used:
 *   Stocks:  GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,TSLA,...
 *   Crypto:  GET /v2/aggs/ticker/{ticker}/prev (per symbol, rate-limited)
 */
import Config from 'react-native-config';

import type { PolygonSnapshot } from './types';

const BASE = 'https://api.polygon.io';
const API_KEY = Config.POLYGON_API_KEY || '';

const TIMEOUT_MS = 15_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      console.warn(`[PolygonREST] ${resp.status} for ${url.split('?')[0]}`);
      return null;
    }
    return (await resp.json()) as T;
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      console.warn('[PolygonREST] fetch error:', e.message);
    }
    return null;
  }
}

// ─── Delay helper for crypto rate limiting ──────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Public API ─────────────────────────────────────────────────────────────

class PolygonRestClient {
  /**
   * Returns true if the API key is configured.
   */
  get isConfigured(): boolean {
    return API_KEY.length > 0 && !API_KEY.includes('your_polygon');
  }

  /**
   * Fetch snapshots for a list of stock AND crypto symbols.
   * Stocks are batched in a single request. Crypto is fetched individually.
   */
  async getSnapshots(symbols: string[]): Promise<PolygonSnapshot[]> {
    if (!this.isConfigured || symbols.length === 0) {
      return [];
    }

    // Separate stock symbols from crypto
    const stockSymbols: string[] = [];
    const cryptoSymbols: string[] = [];

    for (const sym of symbols) {
      if (this.isCryptoTicker(sym)) {
        cryptoSymbols.push(sym);
      } else {
        stockSymbols.push(sym);
      }
    }

    const results: PolygonSnapshot[] = [];

    // ── Batch fetch stocks ───────────────────────────────────────────────
    if (stockSymbols.length > 0) {
      const stockSnaps = await this.fetchStockSnapshots(stockSymbols);
      results.push(...stockSnaps);
    }

    // ── Sequential crypto fetch (respect rate limits) ────────────────────
    if (cryptoSymbols.length > 0) {
      const cryptoSnaps = await this.fetchCryptoSnapshots(cryptoSymbols);
      results.push(...cryptoSnaps);
    }

    return results;
  }

  // ── Private: stocks ─────────────────────────────────────────────────────

  private async fetchStockSnapshots(symbols: string[]): Promise<PolygonSnapshot[]> {
    const url = `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols.join(',')}&apiKey=${API_KEY}`;
    const data = await fetchJSON<{ tickers?: any[] }>(url);
    if (!data?.tickers) {
      return [];
    }

    return data.tickers.map((t: any) => {
      const prevClose = t.prevDay?.c || 0;
      const price = t.day?.c || t.min?.c || prevClose;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      return {
        symbol: t.ticker,
        price,
        open: t.day?.o || 0,
        high: t.day?.h || 0,
        low: t.day?.l || 0,
        close: price,
        volume: t.day?.v || 0,
        prevClose,
        change,
        changePercent: changePct,
        bid: t.lastQuote?.P,
        ask: t.lastQuote?.p,
        timestamp: t.updated || Date.now(),
      } satisfies PolygonSnapshot;
    });
  }

  // ── Private: crypto ─────────────────────────────────────────────────────

  private async fetchCryptoSnapshots(symbols: string[]): Promise<PolygonSnapshot[]> {
    const results: PolygonSnapshot[] = [];

    for (const sym of symbols) {
      const polygonTicker = this.toPolygonCryptoTicker(sym);
      const url = `${BASE}/v2/aggs/ticker/${polygonTicker}/prev?adjusted=true&apiKey=${API_KEY}`;
      const data = await fetchJSON<{ results?: any[] }>(url);

      if (data?.results?.[0]) {
        const bar = data.results[0];
        const price = bar.c;
        const prevOpen = bar.o || price;
        const change = price - prevOpen;
        const changePct = prevOpen > 0 ? (change / prevOpen) * 100 : 0;

        results.push({
          symbol: sym,
          price,
          open: bar.o || 0,
          high: bar.h || 0,
          low: bar.l || 0,
          close: price,
          volume: bar.v || 0,
          prevClose: prevOpen,
          change,
          changePercent: changePct,
          timestamp: bar.t || Date.now(),
        });
      }

      // Rate limit: 100ms between crypto requests
      if (symbols.indexOf(sym) < symbols.length - 1) {
        await delay(100);
      }
    }

    return results;
  }

  // ── Crypto symbol helpers ─────────────────────────────────────────────────

  private readonly KNOWN_CRYPTO = new Set([
    'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'DOT', 'AVAX', 'LINK',
    'MATIC', 'POL', 'UNI', 'ATOM', 'LTC', 'SHIB', 'TRX', 'NEAR', 'APT',
    'ARB', 'OP', 'AAVE', 'MKR', 'GRT', 'FTM', 'ALGO', 'HYPE', 'XETH',
    'BNB', 'USDT', 'USDC', 'BONK', 'WIF', 'PEPE', 'INJ', 'SUI', 'SEI',
    'COMP', 'CRV', 'SNX', 'LDO', 'RNDR', 'IMX', 'RUNE', 'DAI',
  ]);

  isCryptoTicker(sym: string): boolean {
    return this.KNOWN_CRYPTO.has(sym.toUpperCase());
  }

  /**
   * Convert simple ticker (BTC) to Polygon crypto format (X:BTCUSD)
   */
  toPolygonCryptoTicker(sym: string): string {
    const upper = sym.toUpperCase();
    if (upper.startsWith('X:')) {
      return upper;
    }
    return `X:${upper}USD`;
  }
}

export const polygonRestClient = new PolygonRestClient();

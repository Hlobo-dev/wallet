/**
 * Polygon.io WebSocket Client for React Native
 *
 * Enterprise-grade real-time market data streaming.
 * Connects directly to Polygon.io's WebSocket API to receive:
 *   - Per-second aggregates (A.*) for stocks
 *   - Per-second aggregates (XA.*) for crypto
 *
 * Architecture:
 *   1. Maintains two WebSocket connections: one for stocks, one for crypto
 *   2. Auto-reconnects with exponential backoff (1s → 30s, max 20 attempts)
 *   3. Heartbeat monitoring — reconnects if no messages for 60s
 *   4. Subscription management — only subscribes to held tickers
 *   5. Price cache with prevClose for change% calculation
 *   6. Event-driven callbacks for React integration
 *
 * Polygon WebSocket docs:
 *   Stocks: wss://socket.polygon.io/stocks
 *   Crypto: wss://socket.polygon.io/crypto
 *
 * Message flow:
 *   1. Connect → receive [{ev: "status", status: "connected"}]
 *   2. Auth    → send {"action": "auth", "params": "<API_KEY>"}
 *              → receive [{ev: "status", status: "auth_success"}]
 *   3. Sub     → send {"action": "subscribe", "params": "A.AAPL,A.TSLA,..."}
 *              → receive [{ev: "status", status: "success", message: "subscribed to: A.AAPL"}]
 *   4. Stream  → receive [{ev: "A", sym: "AAPL", o: 150, h: 151, l: 149, c: 150.5, ...}]
 */

import { AppState, type AppStateStatus } from 'react-native';
import Config from 'react-native-config';

import type { LivePrice, PolygonAggregate } from './types';

const API_KEY = Config.POLYGON_API_KEY || '';

// WebSocket URLs
const WS_STOCKS_URL = 'wss://socket.polygon.io/stocks';
const WS_CRYPTO_URL = 'wss://socket.polygon.io/crypto';

// Reconnection config
const MAX_RECONNECT_ATTEMPTS = 20;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

// Heartbeat: if no message for 60s, consider connection dead
const HEARTBEAT_TIMEOUT_MS = 60_000;

// ─── Types ──────────────────────────────────────────────────────────────────

type PriceListener = (prices: Map<string, LivePrice>) => void;

interface SocketState {
  ws: WebSocket | null;
  isAuthenticated: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setTimeout> | null;
  lastMessageAt: number;
  subscribedSymbols: Set<string>;
}

// ─── WebSocket Client ───────────────────────────────────────────────────────

export class PolygonWebSocket {
  /** Live price cache: symbol → LivePrice */
  private prices = new Map<string, LivePrice>();

  /** Previous close cache (from REST API): symbol → prevClose price */
  private prevCloses = new Map<string, number>();

  /** Desired subscriptions (symbols the user holds) */
  private desiredStockSymbols = new Set<string>();
  private desiredCryptoSymbols = new Set<string>();

  /** Socket state */
  private stockSocket: SocketState = this.createSocketState();
  private cryptoSocket: SocketState = this.createSocketState();

  /** Listeners */
  private listeners = new Set<PriceListener>();

  /** AppState tracking */
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private isInForeground = true;

  /** Notification debounce — fire at most every 250ms */
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyPending = false;

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Returns true if the API key is configured.
   */
  get isConfigured(): boolean {
    return API_KEY.length > 0 && !API_KEY.includes('your_polygon');
  }

  /**
   * Register a listener for price updates.
   * Returns an unsubscribe function.
   */
  onPriceUpdate(listener: PriceListener): () => void {
    this.listeners.add(listener);
    // Immediately send current state
    if (this.prices.size > 0) {
      listener(this.prices);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current cached price for a symbol (or undefined).
   */
  getPrice(symbol: string): LivePrice | undefined {
    return this.prices.get(symbol.toUpperCase());
  }

  /**
   * Get all current cached prices.
   */
  getAllPrices(): Map<string, LivePrice> {
    return new Map(this.prices);
  }

  /**
   * Seed the prevClose cache from REST API snapshots.
   * Call this BEFORE connect() so we can compute change% from the first tick.
   */
  seedPrevCloses(snapshots: Array<{ symbol: string; prevClose: number; price: number; changePercent: number }>) {
    for (const snap of snapshots) {
      const sym = snap.symbol.toUpperCase();
      this.prevCloses.set(sym, snap.prevClose);

      // Also seed the price cache so UI has data immediately
      this.prices.set(sym, {
        price: snap.price,
        prevClose: snap.prevClose,
        change: snap.price - snap.prevClose,
        changePercent: snap.changePercent,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Set the symbols we want to subscribe to.
   * Automatically manages subscriptions (adds new, removes old).
   */
  setSubscriptions(stockSymbols: string[], cryptoSymbols: string[]) {
    const newStocks = new Set(stockSymbols.map(s => s.toUpperCase()));
    const newCrypto = new Set(cryptoSymbols.map(s => s.toUpperCase()));

    const stocksChanged = !setsEqual(newStocks, this.desiredStockSymbols);
    const cryptoChanged = !setsEqual(newCrypto, this.desiredCryptoSymbols);

    this.desiredStockSymbols = newStocks;
    this.desiredCryptoSymbols = newCrypto;

    // Re-subscribe on existing connections if needed
    if (stocksChanged && this.stockSocket.isAuthenticated) {
      this.syncSubscriptions('stocks');
    }
    if (cryptoChanged && this.cryptoSocket.isAuthenticated) {
      this.syncSubscriptions('crypto');
    }

    // Connect sockets that aren't connected yet
    if (newStocks.size > 0 && !this.stockSocket.ws) {
      this.connectSocket('stocks');
    }
    if (newCrypto.size > 0 && !this.cryptoSocket.ws) {
      this.connectSocket('crypto');
    }

    // Disconnect sockets with no subscriptions
    if (newStocks.size === 0 && this.stockSocket.ws) {
      this.disconnectSocket('stocks');
    }
    if (newCrypto.size === 0 && this.cryptoSocket.ws) {
      this.disconnectSocket('crypto');
    }
  }

  /**
   * Start the WebSocket connections + AppState listener.
   */
  connect() {
    if (!this.isConfigured) {
      console.warn('[PolygonWS] API key not configured — skipping WebSocket');
      return;
    }

    console.log('[PolygonWS] Starting real-time streaming...');

    // Connect sockets for any existing subscriptions
    if (this.desiredStockSymbols.size > 0) {
      this.connectSocket('stocks');
    }
    if (this.desiredCryptoSymbols.size > 0) {
      this.connectSocket('crypto');
    }

    // Monitor app state for background/foreground transitions
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    }
  }

  /**
   * Disconnect all WebSockets and cleanup.
   */
  disconnect() {
    console.log('[PolygonWS] Shutting down...');
    this.disconnectSocket('stocks');
    this.disconnectSocket('crypto');

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
  }

  // ── Private: Socket lifecycle ─────────────────────────────────────────────

  private createSocketState(): SocketState {
    return {
      ws: null,
      isAuthenticated: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      heartbeatTimer: null,
      lastMessageAt: 0,
      subscribedSymbols: new Set(),
    };
  }

  private getSocketState(market: 'stocks' | 'crypto'): SocketState {
    return market === 'stocks' ? this.stockSocket : this.cryptoSocket;
  }

  private connectSocket(market: 'stocks' | 'crypto') {
    const state = this.getSocketState(market);

    // Cleanup any existing connection
    if (state.ws) {
      this.cleanupSocket(state);
    }

    const url = market === 'stocks' ? WS_STOCKS_URL : WS_CRYPTO_URL;
    console.log(`[PolygonWS] Connecting to ${market}... (${url})`);

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log(`[PolygonWS] ${market} connected — authenticating...`);
        state.reconnectAttempts = 0;
        // Auth happens after we receive the "connected" status message
      };

      ws.onmessage = (event: WebSocketMessageEvent) => {
        state.lastMessageAt = Date.now();
        this.resetHeartbeat(state, market);

        try {
          const messages: any[] = JSON.parse(event.data);
          for (const msg of messages) {
            this.handleMessage(msg, market, state);
          }
        } catch (e) {
          console.warn(`[PolygonWS] ${market} parse error:`, e);
        }
      };

      ws.onerror = (event: Event) => {
        console.warn(`[PolygonWS] ${market} error:`, event);
      };

      ws.onclose = (event: WebSocketCloseEvent) => {
        console.log(`[PolygonWS] ${market} closed (code=${event.code})`);
        state.isAuthenticated = false;
        state.subscribedSymbols.clear();

        // Don't reconnect if we intentionally closed or app is backgrounded
        if (event.code !== 1000 && this.isInForeground) {
          this.scheduleReconnect(market);
        }
      };

      state.ws = ws;
    } catch (e) {
      console.error(`[PolygonWS] Failed to create ${market} WebSocket:`, e);
      this.scheduleReconnect(market);
    }
  }

  private disconnectSocket(market: 'stocks' | 'crypto') {
    const state = this.getSocketState(market);
    this.cleanupSocket(state);
    state.reconnectAttempts = 0;
  }

  private cleanupSocket(state: SocketState) {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.heartbeatTimer) {
      clearTimeout(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    if (state.ws) {
      try {
        state.ws.close(1000, 'Client disconnect');
      } catch {
        // ignore
      }
      state.ws = null;
    }
    state.isAuthenticated = false;
    state.subscribedSymbols.clear();
  }

  // ── Private: Message handling ─────────────────────────────────────────────

  private handleMessage(msg: any, market: 'stocks' | 'crypto', state: SocketState) {
    switch (msg.ev) {
      case 'status':
        this.handleStatus(msg, market, state);
        break;

      case 'A':  // Per-second stock aggregate
      case 'AM': // Per-minute stock aggregate
      case 'XA': // Per-second crypto aggregate
      case 'XAM': // Per-minute crypto aggregate
        this.handleAggregate(msg as PolygonAggregate);
        break;

      default:
        // Ignore other event types (T, Q, etc.)
        break;
    }
  }

  private handleStatus(msg: any, market: 'stocks' | 'crypto', state: SocketState) {
    const { status, message } = msg;

    if (status === 'connected') {
      // Socket connected — send auth
      console.log(`[PolygonWS] ${market}: ${message}`);
      this.sendAuth(state);
    } else if (status === 'auth_success') {
      // Authenticated — subscribe to desired symbols
      console.log(`[PolygonWS] ${market}: Authenticated ✓`);
      state.isAuthenticated = true;
      this.syncSubscriptions(market);
    } else if (status === 'auth_failed') {
      console.warn(`[PolygonWS] ${market}: Auth failed — ${message}. WebSocket streaming disabled for this market.`);
      // Don't reconnect on auth failure — close cleanly so onclose won't retry
      this.disconnectSocket(market);
    } else if (status === 'success') {
      // Subscription confirmation — log it
      console.log(`[PolygonWS] ${market}: ${message}`);
    } else {
      console.log(`[PolygonWS] ${market} status: ${status} — ${message}`);
    }
  }

  private handleAggregate(agg: PolygonAggregate) {
    const sym = agg.sym.toUpperCase();
    const prevClose = this.prevCloses.get(sym) || agg.o; // fallback to aggregate open
    const change = agg.c - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    this.prices.set(sym, {
      price: agg.c,
      prevClose,
      change,
      changePercent: changePct,
      updatedAt: Date.now(),
    });

    this.scheduleNotify();
  }

  // ── Private: Auth & subscriptions ─────────────────────────────────────────

  private sendAuth(state: SocketState) {
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ action: 'auth', params: API_KEY }));
    }
  }

  /**
   * Sync current subscriptions with desired subscriptions.
   * Subscribes new symbols, unsubscribes removed ones.
   */
  private syncSubscriptions(market: 'stocks' | 'crypto') {
    const state = this.getSocketState(market);
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.isAuthenticated) {
      return;
    }

    const desired = market === 'stocks' ? this.desiredStockSymbols : this.desiredCryptoSymbols;
    const prefix = market === 'stocks' ? 'A' : 'XA';

    // Symbols to add
    const toAdd: string[] = [];
    for (const sym of desired) {
      const channel = market === 'crypto' ? `${prefix}.X:${sym}USD` : `${prefix}.${sym}`;
      if (!state.subscribedSymbols.has(channel)) {
        toAdd.push(channel);
        state.subscribedSymbols.add(channel);
      }
    }

    // Symbols to remove
    const toRemove: string[] = [];
    for (const channel of state.subscribedSymbols) {
      // Extract the symbol from the channel name
      const channelSym = channel.replace(`${prefix}.`, '').replace('X:', '').replace('USD', '');
      if (!desired.has(channelSym)) {
        toRemove.push(channel);
        state.subscribedSymbols.delete(channel);
      }
    }

    if (toAdd.length > 0) {
      console.log(`[PolygonWS] ${market}: subscribing to ${toAdd.length} symbols`);
      state.ws.send(JSON.stringify({ action: 'subscribe', params: toAdd.join(',') }));
    }

    if (toRemove.length > 0) {
      console.log(`[PolygonWS] ${market}: unsubscribing from ${toRemove.length} symbols`);
      state.ws.send(JSON.stringify({ action: 'unsubscribe', params: toRemove.join(',') }));
    }
  }

  // ── Private: Reconnection ────────────────────────────────────────────────

  private scheduleReconnect(market: 'stocks' | 'crypto') {
    const state = this.getSocketState(market);

    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[PolygonWS] ${market}: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, state.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );

    state.reconnectAttempts++;
    console.log(`[PolygonWS] ${market}: Reconnecting in ${delay / 1000}s (attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.connectSocket(market);
    }, delay);
  }

  // ── Private: Heartbeat ───────────────────────────────────────────────────

  private resetHeartbeat(state: SocketState, market: 'stocks' | 'crypto') {
    if (state.heartbeatTimer) {
      clearTimeout(state.heartbeatTimer);
    }

    state.heartbeatTimer = setTimeout(() => {
      console.warn(`[PolygonWS] ${market}: No messages for ${HEARTBEAT_TIMEOUT_MS / 1000}s — reconnecting`);
      this.cleanupSocket(state);
      this.connectSocket(market);
    }, HEARTBEAT_TIMEOUT_MS);
  }

  // ── Private: AppState ────────────────────────────────────────────────────

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      console.log('[PolygonWS] App foregrounded — reconnecting WebSockets');
      this.isInForeground = true;

      // Reconnect with fresh state
      if (this.desiredStockSymbols.size > 0) {
        this.connectSocket('stocks');
      }
      if (this.desiredCryptoSymbols.size > 0) {
        this.connectSocket('crypto');
      }
    } else {
      console.log('[PolygonWS] App backgrounded — disconnecting WebSockets');
      this.isInForeground = false;

      // Disconnect to save battery & avoid Polygon rate limits
      this.disconnectSocket('stocks');
      this.disconnectSocket('crypto');
    }
  };

  // ── Private: Notify listeners ────────────────────────────────────────────

  private scheduleNotify() {
    this.notifyPending = true;

    if (this.notifyTimer) {
      return; // Already scheduled
    }

    // Debounce: fire at most every 250ms
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      if (this.notifyPending) {
        this.notifyPending = false;
        const snapshot = new Map(this.prices);
        for (const listener of this.listeners) {
          try {
            listener(snapshot);
          } catch (e) {
            console.warn('[PolygonWS] Listener error:', e);
          }
        }
      }
    }, 250);
  }
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const polygonWebSocket = new PolygonWebSocket();

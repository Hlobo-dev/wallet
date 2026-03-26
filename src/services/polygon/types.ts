/**
 * Polygon.io TypeScript types for REST + WebSocket
 */

// ─── REST API types ─────────────────────────────────────────────────────────

export interface PolygonQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  prevClose: number;
  timestamp: number;
}

export interface PolygonSnapshot {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prevClose: number;
  change: number;
  changePercent: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

// ─── WebSocket message types ────────────────────────────────────────────────

/**
 * Polygon WebSocket Trade event (T.*)
 * https://polygon.io/docs/stocks/ws_stocks_t
 */
export interface PolygonTrade {
  /** Event type: "T" for stocks, "XT" for crypto */
  ev: 'T' | 'XT';
  /** Symbol */
  sym: string;
  /** Price */
  p: number;
  /** Size */
  s: number;
  /** Timestamp (ms) */
  t: number;
  /** Trade conditions */
  c?: number[];
}

/**
 * Polygon WebSocket Aggregate (per-second or per-minute)
 * https://polygon.io/docs/stocks/ws_stocks_a
 */
export interface PolygonAggregate {
  /** Event type: "A" = per-second agg, "AM" = per-minute agg */
  ev: 'A' | 'AM' | 'XA' | 'XAM';
  /** Symbol */
  sym: string;
  /** Open price */
  o: number;
  /** High price */
  h: number;
  /** Low price */
  l: number;
  /** Close price */
  c: number;
  /** Volume */
  v: number;
  /** VWAP */
  vw: number;
  /** Aggregate start timestamp (ms) */
  s: number;
  /** Aggregate end timestamp (ms) */
  e: number;
}

/**
 * Polygon WebSocket status message
 */
export interface PolygonStatusMessage {
  ev: 'status';
  status: string;
  message: string;
}

/**
 * Union of all possible Polygon WebSocket messages
 */
export type PolygonWSMessage = PolygonTrade | PolygonAggregate | PolygonStatusMessage;

// ─── Price cache types ──────────────────────────────────────────────────────

export interface LivePrice {
  /** Current price */
  price: number;
  /** Previous close price */
  prevClose: number;
  /** Change since previous close (price - prevClose) */
  change: number;
  /** Change percent since previous close */
  changePercent: number;
  /** Last updated timestamp (ms) */
  updatedAt: number;
}

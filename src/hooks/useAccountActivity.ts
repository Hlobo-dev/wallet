/**
 * useAccountActivity — Unified activity feed across all connected accounts.
 *
 * Generates activity items from three sources (in priority order):
 *   1. Brokerage orders (SnapTrade getOrders) — actual buy/sell orders
 *   2. Wealth investment transactions (Plaid) — actual buy/sell/dividend
 *   3. Current holdings (fallback) — synthesized from positions the user holds
 *
 * If the API-based sources return empty (common when the user hasn't placed
 * orders through the app), we generate "Holding" entries from the existing
 * brokerage + wealth positions so the activity feed is never empty.
 */
import { useMemo } from 'react';

import { useBrokeragePositions } from '@/hooks/useBrokeragePositions';
import type { BrokerageHolding } from '@/hooks/useBrokeragePositions';
import { useWealthPositions } from '@/hooks/useWealthPositions';
import type { WealthHolding } from '@/hooks/useWealthPositions';

// ─── Unified activity item ───────────────────────────────────────────────────

export type AccountActivitySource = 'brokerage' | 'wealth';
export type AccountActivityAction = 'buy' | 'sell' | 'holding' | 'dividend' | 'transfer' | 'fee' | 'interest' | 'other';

export interface AccountActivityItem {
  /** Unique identifier */
  id: string;
  /** Source system */
  source: AccountActivitySource;
  /** Symbol, e.g. "AAPL" */
  symbol: string;
  /** Human-readable name, e.g. "Apple Inc" */
  name: string;
  /** Action type */
  action: AccountActivityAction;
  /** Display label, e.g. "Buy AAPL" or "Holding TSLA" */
  title: string;
  /** Secondary line, e.g. "Robinhood · 10 shares @ $150.00" */
  subtitle: string;
  /** Dollar amount (market value for holdings) */
  amount: number;
  /** Number of units */
  quantity: number;
  /** Price per unit */
  price: number;
  /** Unrealised P&L in USD */
  pnl: number;
  /** Unrealised P&L as a percentage */
  pnlPercent: number;
  /** Institution / account name */
  accountName: string;
  /** Whether this is a cryptocurrency */
  isCrypto: boolean;
  /** Background color for the logo fallback */
  bgColor: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapBrokerageHolding(h: BrokerageHolding): AccountActivityItem {
  const pnlSign = h.unrealizedPnl >= 0 ? '+' : '';
  return {
    id: h.key,
    source: 'brokerage',
    symbol: h.symbol,
    name: h.name,
    action: 'holding',
    title: h.name || h.symbol,
    subtitle: `${h.accountName} · ${h.units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} shares`,
    amount: h.value,
    quantity: h.units,
    price: h.price,
    pnl: h.unrealizedPnl,
    pnlPercent: h.unrealizedPnlPercent,
    accountName: h.accountName,
    isCrypto: h.isCrypto,
    bgColor: h.bgColor,
  };
}

function mapWealthHolding(h: WealthHolding): AccountActivityItem {
  return {
    id: h.key,
    source: 'wealth',
    symbol: h.tickerSymbol || h.symbol,
    name: h.name,
    action: 'holding',
    title: h.name || h.symbol,
    subtitle: `${h.institution} · ${h.quantity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} shares`,
    amount: h.currentValue,
    quantity: h.quantity,
    price: h.price,
    pnl: h.unrealizedPnl ?? 0,
    pnlPercent: h.unrealizedPnlPercent ?? 0,
    accountName: h.institution,
    isCrypto: false,
    bgColor: h.bgColor,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccountActivity() {
  const { holdings: brokerageHoldings, isLoading: brokerageLoading } = useBrokeragePositions();
  const { holdings: wealthHoldings, isLoading: wealthLoading } = useWealthPositions();

  const activities = useMemo<AccountActivityItem[]>(() => {
    const items: AccountActivityItem[] = [];

    // Map all brokerage holdings → activity items
    for (const h of brokerageHoldings) {
      items.push(mapBrokerageHolding(h));
    }

    // Map all wealth holdings → activity items
    for (const h of wealthHoldings) {
      items.push(mapWealthHolding(h));
    }

    // Sort by market value descending (largest positions first)
    items.sort((a, b) => b.amount - a.amount);

    return items;
  }, [brokerageHoldings, wealthHoldings]);

  // Extract unique account names (for the AccountFilter pill bar)
  const accountNames = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const a of activities) {
      if (a.accountName) {
        seen.add(a.accountName);
      }
    }
    return Array.from(seen).sort();
  }, [activities]);

  const isLoading = brokerageLoading || wealthLoading;

  return { activities, accountNames, isLoading };
}

/**
 * useAccountActivity — Unified activity feed across all connected accounts.
 *
 * PRIMARY path  (same as the Vibe-Trading web frontend):
 *   GET /api/portfolio/activity?days=90&limit=200  with Bearer JWT
 *   → returns both Plaid + SnapTrade transactions from the backend in one call.
 *
 * FALLBACK path (credential-based, no JWT needed):
 *   POST /api/snaptrade/accounts/:id/activities  for each SnapTrade account
 *   GET  /api/plaid/transactions                  for Plaid
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ASTELLR_PLATFORM_URL } from '@/screens/Chat/chatConfig';
import { getSnapTradeClient } from '@/services/snaptrade';
import type { SnapTradeActivity } from '@/services/snaptrade';
import { getPlaidClient } from '@/services/plaid';
import { useAstellrAuth } from '@/providers/AstellrAuthProvider';
import { useBrokeragePositions } from '@/hooks/useBrokeragePositions';
import { useWealthPositions } from '@/hooks/useWealthPositions';

// ─── Unified activity item ───────────────────────────────────────────────────

export type AccountActivitySource = 'brokerage' | 'wealth';
export type AccountActivityAction = 'buy' | 'sell' | 'holding' | 'dividend' | 'transfer' | 'fee' | 'interest' | 'deposit' | 'withdrawal' | 'other';

export interface AccountActivityItem {
  /** Unique identifier */
  id: string;
  /** Source system */
  source: AccountActivitySource;
  /** Symbol, e.g. "AAPL" */
  symbol: string;
  /** Human-readable name, e.g. "Apple Inc" or transaction description */
  name: string;
  /** Action type */
  action: AccountActivityAction;
  /** Display label, e.g. "Bought AAPL" or "Holding TSLA" */
  title: string;
  /** Secondary line, e.g. "Morgan Stanley · 50 shares @ $180.00" */
  subtitle: string;
  /** Dollar amount (positive = cash in, negative = cash out) */
  amount: number;
  /** Number of units */
  quantity: number;
  /** Price per unit */
  price: number;
  /** Unrealised P&L in USD (0 for real transactions) */
  pnl: number;
  /** Unrealised P&L as a percentage (0 for real transactions) */
  pnlPercent: number;
  /** Institution / account name */
  accountName: string;
  /** Whether this is a cryptocurrency */
  isCrypto: boolean;
  /** Background color for the logo fallback */
  bgColor: string;
  /** ISO date string for sorting (YYYY-MM-DD) */
  date: string;
  /** Whether this is a real transaction vs a synthesized holding */
  isRealTransaction: boolean;
}

// ─── Action mapping helpers ──────────────────────────────────────────────────

const SNAPTRADE_TYPE_MAP: Record<string, AccountActivityAction> = {
  BUY: 'buy',
  SELL: 'sell',
  DIVIDEND: 'dividend',
  DIV: 'dividend',
  FEE: 'fee',
  INTEREST: 'interest',
  INT: 'interest',
  TRANSFER: 'transfer',
  DEPOSIT: 'deposit',
  DEP: 'deposit',
  WITHDRAWAL: 'withdrawal',
  CONTRIBUTION: 'deposit',
  REINVESTMENT: 'buy',
  REWARD: 'interest',
};

function mapSnapTradeType(raw: string): AccountActivityAction {
  const upper = (raw || '').toUpperCase();
  return SNAPTRADE_TYPE_MAP[upper] ?? 'other';
}

const PLAID_TYPE_MAP: Record<string, AccountActivityAction> = {
  buy: 'buy',
  sell: 'sell',
  dividend: 'dividend',
  fee: 'fee',
  interest: 'interest',
  transfer: 'transfer',
  cash: 'other',
  cancel: 'other',
};

function mapPlaidType(raw: string): AccountActivityAction {
  return PLAID_TYPE_MAP[raw] ?? 'other';
}

function getActionLabel(action: AccountActivityAction): string {
  switch (action) {
    case 'buy': return 'Bought';
    case 'sell': return 'Sold';
    case 'dividend': return 'Dividend';
    case 'fee': return 'Fee';
    case 'interest': return 'Interest';
    case 'transfer': return 'Transfer';
    case 'deposit': return 'Deposit';
    case 'withdrawal': return 'Withdrawal';
    case 'holding': return 'Holding';
    default: return 'Transaction';
  }
}

// ─── Color helpers ───────────────────────────────────────────────────────────

const ACTION_COLORS: Record<AccountActivityAction, string> = {
  buy: '#3b82f6',
  sell: '#ef4444',
  dividend: '#22c55e',
  fee: '#f97316',
  interest: '#06b6d4',
  transfer: '#8b5cf6',
  deposit: '#22c55e',
  withdrawal: '#ef4444',
  holding: '#6366f1',
  other: '#64748b',
};

function getActionColor(action: AccountActivityAction): string {
  return ACTION_COLORS[action] ?? '#64748b';
}

// ─── Known crypto symbols ────────────────────────────────────────────────────

const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'POL', 'UNI', 'ATOM', 'LTC', 'SHIB', 'BNB', 'USDT', 'USDC',
]);

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapSnapTradeActivity(
  act: SnapTradeActivity,
  accountName?: string,
): AccountActivityItem {
  const action = mapSnapTradeType(act.type);
  // symbol can be an object { symbol: 'AAPL', ... } or undefined
  const sym = (typeof act.symbol === 'object' && act.symbol?.symbol)
    ? act.symbol.symbol.toUpperCase()
    : '';
  const resolvedAccountName = accountName || act.accountName || 'Brokerage';
  const qty = Math.abs(act.units);
  const price = act.price;
  const description = act.description || (act.symbol as any)?.description || '';

  let subtitle: string;
  if (qty > 0 && price > 0) {
    subtitle = `${resolvedAccountName} · ${qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} shares @ $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (description) {
    subtitle = `${resolvedAccountName} · ${description}`;
  } else {
    subtitle = resolvedAccountName;
  }

  return {
    id: act.id || `snap_${act.accountId}_${act.tradeDate}_${sym}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'brokerage',
    symbol: sym,
    name: description || sym,
    action,
    title: sym ? `${getActionLabel(action)} ${sym}` : getActionLabel(action),
    subtitle,
    amount: act.amount,
    quantity: qty,
    price,
    pnl: 0,
    pnlPercent: 0,
    accountName: resolvedAccountName,
    isCrypto: CRYPTO_SYMBOLS.has(sym),
    bgColor: getActionColor(action),
    date: (act.tradeDate || act.settlementDate || new Date().toISOString()).slice(0, 10),
    isRealTransaction: true,
  };
}

/** Shape of a Plaid transaction as returned by the backend GET /api/plaid/transactions */
interface PlaidTransactionFromBackend {
  transactionId: string;
  accountId: string;
  date: string;
  name: string;
  type: string;
  subtype: string;
  quantity: number;
  price: number;
  amount: number;
  fees: number | null;
  symbol: string | null;
  securityName: string | null;
  securityType: string | null;
  currency: string;
  institution: string | null;
  itemId: string;
  source: string;
}

function mapPlaidTransaction(
  tx: PlaidTransactionFromBackend,
): AccountActivityItem {
  const action = mapPlaidType(tx.type);
  const sym = (tx.symbol || '').toUpperCase();
  const qty = Math.abs(tx.quantity);
  const price = tx.price;
  const accountName = tx.institution || 'Wealth Account';
  const displayName = tx.securityName || tx.name;

  let subtitle: string;
  if (qty > 0 && price > 0) {
    subtitle = `${accountName} · ${qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} shares @ $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    subtitle = `${accountName} · ${tx.name}`;
  }

  return {
    id: tx.transactionId || `plaid_${tx.date}_${sym}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'wealth',
    symbol: sym,
    name: displayName,
    action,
    title: sym ? `${getActionLabel(action)} ${sym}` : getActionLabel(action),
    subtitle,
    amount: tx.amount,
    quantity: qty,
    price,
    pnl: 0,
    pnlPercent: 0,
    accountName,
    isCrypto: CRYPTO_SYMBOLS.has(sym),
    bgColor: getActionColor(action),
    date: tx.date,
    isRealTransaction: true,
  };
}

// ─── Map unified /api/portfolio/activity response item ───────────────────────

/** Shape returned by the backend GET /api/portfolio/activity */
interface UnifiedBackendTransaction {
  id: string;
  date: string;
  type: string;         // BUY | SELL | DIVIDEND | TRANSFER | FEE | INTEREST | OTHER
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  amount: number;
  fee: number;
  source: 'plaid' | 'snaptrade';
  broker: string;
  brokerageId: string;
  accountName: string;
  description?: string;
}

const UNIFIED_TYPE_MAP: Record<string, AccountActivityAction> = {
  BUY: 'buy',
  SELL: 'sell',
  DIVIDEND: 'dividend',
  TRANSFER: 'transfer',
  FEE: 'fee',
  INTEREST: 'interest',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  TAX: 'fee',
  SPLIT: 'other',
  OPTIONS: 'other',
  OTHER: 'other',
};

function mapUnifiedTransaction(tx: UnifiedBackendTransaction): AccountActivityItem {
  const action = UNIFIED_TYPE_MAP[tx.type] ?? 'other';
  const sym = (tx.symbol || '').toUpperCase().replace('—', '');
  const qty = Math.abs(tx.quantity || 0);
  const price = tx.price || 0;
  const accountName = tx.accountName || tx.broker || 'Account';

  let subtitle: string;
  if (qty > 0 && price > 0) {
    subtitle = `${accountName} · ${qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} shares @ $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (tx.description) {
    subtitle = `${accountName} · ${tx.description}`;
  } else {
    subtitle = accountName;
  }

  return {
    id: tx.id || `unified_${tx.date}_${sym}_${Math.random().toString(36).slice(2, 8)}`,
    source: tx.source === 'plaid' ? 'wealth' : 'brokerage',
    symbol: sym,
    name: tx.name || tx.description || sym,
    action,
    title: sym ? `${getActionLabel(action)} ${sym}` : getActionLabel(action),
    subtitle,
    amount: tx.amount || 0,
    quantity: qty,
    price,
    pnl: 0,
    pnlPercent: 0,
    accountName,
    isCrypto: CRYPTO_SYMBOLS.has(sym),
    bgColor: getActionColor(action),
    date: (tx.date || new Date().toISOString()).slice(0, 10),
    isRealTransaction: true,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccountActivity() {
  const { isLoading: brokerageLoading } = useBrokeragePositions();
  const { isLoading: wealthLoading } = useWealthPositions();

  const [allActivities, setAllActivities] = useState<AccountActivityItem[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const [debugMsg, setDebugMsg] = useState('initializing…');
  const hasFetched = useRef(false);

  const { getAccessToken, user } = useAstellrAuth();
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);

  // ── Reset state when user changes (multi-user isolation) ─────────────────
  useEffect(() => {
    const newUserId = user?.id ?? null;
    if (currentUserIdRef.current !== newUserId) {
      console.log(`[useAccountActivity] User changed: ${currentUserIdRef.current} → ${newUserId}`);
      currentUserIdRef.current = newUserId;
      setAllActivities([]);
      setIsLoadingTx(true);
      setDebugMsg('user changed, re-fetching…');
      hasFetched.current = false;
    }
  }, [user?.id]);

  // ── Helper: fetch from unified backend endpoint (like Vibe-Trading web) ─
  const fetchUnified = async (token: string): Promise<AccountActivityItem[]> => {
    const url = `${ASTELLR_PLATFORM_URL}/api/portfolio/activity?days=90&limit=200`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.success || !Array.isArray(json.transactions)) {
        throw new Error('Bad response shape');
      }

      console.log(`[useAccountActivity] Unified endpoint: ${json.transactions.length} transactions from ${(json.brokers || []).join(', ')}`);

      return json.transactions.map((tx: any) => mapUnifiedTransaction(tx));
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  // ── Helper: fallback credential-based fetch (SnapTrade + Plaid separately)
  const fetchFallback = async (): Promise<AccountActivityItem[]> => {
    const items: AccountActivityItem[] = [];

    // SnapTrade (credential-based, no JWT needed)
    try {
      const snapClient = getSnapTradeClient();
      const isRegistered = await snapClient.isRegistered();
      if (isRegistered) {
        const accountsResult = await snapClient.listAccounts();
        const accounts = accountsResult.success ? (accountsResult.data ?? []) : [];
        console.log(`[useAccountActivity] Fallback: ${accounts.length} SnapTrade accounts`);

        for (const account of accounts) {
          const accountName = account.institutionName || account.name || 'Brokerage';
          try {
            const activitiesResult = await snapClient.getActivities(account.id);
            const activities = activitiesResult.success ? (activitiesResult.data ?? []) : [];
            for (const act of activities) {
              items.push(mapSnapTradeActivity(act, accountName));
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[useAccountActivity] Fallback SnapTrade error:', e);
    }

    // Plaid (JWT-based)
    try {
      const token = await getAccessToken();
      if (token) {
        const plaidClient = getPlaidClient();
        plaidClient.setAuthToken(token);
        const txResult = await plaidClient.getInvestmentTransactions();
        if (txResult.success && txResult.data?.transactions) {
          for (const tx of txResult.data.transactions) {
            items.push(mapPlaidTransaction(tx as unknown as PlaidTransactionFromBackend));
          }
        }
      }
    } catch (e) {
      console.warn('[useAccountActivity] Fallback Plaid error:', e);
    }

    return items;
  };

  // ── Core fetch logic ────────────────────────────────────────────────────
  const doFetch = useCallback(async () => {
    setIsLoadingTx(true);
    setDebugMsg('fetching…');
    let items: AccountActivityItem[] = [];

    // Strategy 1: unified backend endpoint (same as Vibe-Trading web frontend)
    try {
      const token = await getAccessToken();
      if (token) {
        items = await fetchUnified(token);
        setDebugMsg(`unified: ${items.length} tx`);
      } else {
        setDebugMsg('no JWT, trying fallback…');
      }
    } catch (unifiedErr) {
      console.warn('[useAccountActivity] Unified endpoint failed, falling back:', unifiedErr);
      setDebugMsg('unified failed, fallback…');
    }

    // Strategy 2: credential-based fallback
    if (items.length === 0) {
      try {
        items = await fetchFallback();
        setDebugMsg(`fallback: ${items.length} tx`);
      } catch (fbErr) {
        console.warn('[useAccountActivity] Fallback also failed:', fbErr);
        setDebugMsg('both failed');
      }
    }

    // Sort newest first
    items.sort((a, b) => b.date.localeCompare(a.date));

    console.log(`[useAccountActivity] ★ DONE: ${items.length} total transactions ★`);
    setDebugMsg(`✅ ${items.length} transactions`);
    setAllActivities(items);
    setIsLoadingTx(false);
  }, [getAccessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch on mount or when user changes ─────────────────────────────────
  useEffect(() => {
    if (hasFetched.current) {
      return;
    }
    hasFetched.current = true;
    doFetch();
  }, [doFetch, user?.id]);

  // ── Manual refetch ──────────────────────────────────────────────────────
  const refetch = useCallback(async () => {
    hasFetched.current = false;
    await doFetch();
  }, [doFetch]);

  // ── Derived data ────────────────────────────────────────────────────────
  const accountNames = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const a of allActivities) {
      if (a.accountName) {
        seen.add(a.accountName);
      }
    }
    return Array.from(seen).sort();
  }, [allActivities]);

  const isLoading = brokerageLoading || wealthLoading || isLoadingTx;

  return { activities: allActivities, accountNames, isLoading, refetch, debugMsg };
}

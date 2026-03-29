/**
 * Hook that fetches and returns connected brokerage (SnapTrade) and wealth (Plaid) accounts.
 * Uses AsyncStorage to cache the results so the list appears immediately on re-open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ImageSourcePropType } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSnapTradeClient } from '@/services/snaptrade';
import type { BrokerageConnection } from '@/services/snaptrade';
import { BROKERAGES } from '@/services/snaptrade';
import { getPlaidClient } from '@/services/plaid';
import type { PlaidConnection } from '@/services/plaid';
import { findWealthInstitution } from '@/services/plaid/wealthInstitutions';
import { useAstellrAuth } from '@/providers/AstellrAuthProvider';
import { scopedKey, getCurrentUserId, USER_SCOPED_KEYS } from '@/utils/userScopedStorage';

// ─── Unified type ────────────────────────────────────────────────────────────

export type ConnectedAccountType = 'brokerage' | 'wealth';

export interface ConnectedAccount {
  /** Unique id for the connection */
  id: string;
  /** Human-readable name, e.g. "Robinhood", "Morgan Stanley" */
  name: string;
  /** Type of connection */
  type: ConnectedAccountType;
  /** Optional logo (bundled require() for brokerages/wealth, URI string for Plaid) */
  logo?: ImageSourcePropType | string | null;
  /** Whether the logo needs a white background */
  needsWhiteBg?: boolean;
  /** Total balance in USD, if available */
  balance?: number | null;
  /** Connection status */
  status: 'active' | 'error' | 'expired' | 'syncing';
  /** The underlying connection id for disconnect / manage */
  connectionId: string;
  /** Brand color (for wealth account fallback avatars) */
  brandColor?: string;
  /** Two-letter fallback for wealth accounts */
  fallback?: string;
}

const CACHE_BASE_KEY = USER_SCOPED_KEYS.CONNECTED_ACCOUNTS_CACHE;

async function loadCache(): Promise<ConnectedAccount[]> {
  try {
    const userId = await getCurrentUserId();
    const key = scopedKey(CACHE_BASE_KEY, userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return [];
}

async function saveCache(accounts: ConnectedAccount[]): Promise<void> {
  try {
    // Strip non-serialisable logo (require() number) before caching
    const serialisable = accounts.map(a => ({
      ...a,
      logo: typeof a.logo === 'string' ? a.logo : undefined,
    }));
    const userId = await getCurrentUserId();
    const key = scopedKey(CACHE_BASE_KEY, userId);
    await AsyncStorage.setItem(key, JSON.stringify(serialisable));
  } catch {
    // ignore
  }
}

function mapBrokerageConnection(conn: BrokerageConnection): ConnectedAccount {
  const knownBrokerage = BROKERAGES.find(
    b => b.slug.toLowerCase() === conn.brokerage?.slug?.toLowerCase() || b.name.toLowerCase() === conn.name?.toLowerCase(),
  );

  return {
    id: `snaptrade_${conn.id}`,
    name: knownBrokerage?.name ?? conn.brokerage?.name ?? conn.name ?? 'Brokerage',
    type: 'brokerage',
    logo: (knownBrokerage?.logo as number | undefined) ?? conn.brokerage?.logoUrl ?? null,
    needsWhiteBg: knownBrokerage?.needsWhiteBg ?? false,
    balance: null,
    status: conn.disabled ? 'error' : 'active',
    connectionId: conn.id,
  };
}

function mapPlaidConnection(conn: PlaidConnection): ConnectedAccount {
  const institutionName = conn.institutionName ?? 'Wealth Account';
  // Look up bundled logo from wealth institutions (same logos as Vibe-Trading)
  const knownInst = findWealthInstitution(institutionName);

  return {
    id: `plaid_${conn.itemId}`,
    name: institutionName,
    type: 'wealth',
    // Prefer bundled logo over Plaid's remote logo URL for reliability
    logo: knownInst?.logo ?? conn.institutionLogo ?? null,
    needsWhiteBg: knownInst?.needsWhiteBg ?? false,
    balance: null,
    status: conn.status === 'active' ? 'active' : 'error',
    connectionId: conn.itemId,
    brandColor: knownInst?.color ?? '#6b7280',
    fallback: knownInst?.fallback ?? institutionName.substring(0, 2).toUpperCase(),
  };
}

export const useConnectedAccounts = () => {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { getAccessToken, isAuthenticated, user } = useAstellrAuth();
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);

  // ── Reset state when user changes (multi-user isolation) ─────────────────
  useEffect(() => {
    const newUserId = user?.id ?? null;
    if (currentUserIdRef.current !== newUserId) {
      console.log(`[useConnectedAccounts] User changed: ${currentUserIdRef.current} → ${newUserId}`);
      currentUserIdRef.current = newUserId;
      setAccounts([]);
      setIsLoading(true);
    }
  }, [user?.id]);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);

    const results: ConnectedAccount[] = [];

    try {
      // Fetch SnapTrade brokerage connections
      const snaptradeClient = getSnapTradeClient();
      if (await snaptradeClient.isRegistered()) {
        const connectionsResult = await snaptradeClient.listConnections();
        if (connectionsResult.success && connectionsResult.data) {
          for (const conn of connectionsResult.data) {
            results.push(mapBrokerageConnection(conn));
          }
        }
      }
    } catch {
      // SnapTrade not available – continue
    }

    try {
      // Fetch Plaid wealth connections — needs platform auth token
      const token = await getAccessToken();
      if (token) {
        const plaidClient = getPlaidClient();
        plaidClient.setAuthToken(token);
        const plaidResult = await plaidClient.getConnections();
        if (plaidResult.success && plaidResult.data) {
          for (const conn of plaidResult.data) {
            results.push(mapPlaidConnection(conn));
          }
        }
      }
    } catch {
      // Plaid not available – continue
    }

    setAccounts(results);
    setIsLoading(false);

    if (results.length > 0) {
      saveCache(results);
    } else {
      // Keep the cache if API calls failed but we had cached data
      const cached = await loadCache();
      if (cached.length > 0 && results.length === 0) {
        setAccounts(cached);
      }
    }
  }, [getAccessToken]);

  // Load cache first, then fetch live
  // Re-runs when user changes (multi-user isolation).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await loadCache();
      if (!cancelled && cached.length > 0) {
        setAccounts(cached);
        setIsLoading(false);
      }
      await fetchAccounts();
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchAccounts, user?.id]);

  return {
    connectedAccounts: accounts,
    isLoading,
    refetch: fetchAccounts,
  };
};

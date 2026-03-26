/**
 * 🏦 Plaid Wealth Account Service (React Native)
 *
 * Adapted from the Vibe-Trading web service for React Native.
 * Handles Plaid Link flow, connections, holdings, and account management.
 * Used for read-only tracking of wealth management accounts
 * (Morgan Stanley, Goldman Sachs, Merrill Lynch, etc.)
 *
 * Backend API: NUBLE_PLATFORM_URL/api/plaid/*
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NUBLE_PLATFORM_URL } from '@/screens/Chat/chatConfig';

// =============================================================================
// TYPES
// =============================================================================

export interface PlaidConnection {
  id: string;
  itemId: string;
  institutionId: string | null;
  institutionName: string | null;
  institutionLogo: string | null;
  accountIds: string[];
  products: string[];
  status: 'active' | 'error' | 'expired' | 'expiring' | 'revoked';
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface PlaidHolding {
  securityId: string;
  accountId: string;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  institutionValue: number | null;
  symbol: string;
  name: string;
  type: string;
  closePrice: number | null;
  closePriceAsOf: string | null;
  isoCurrencyCode: string;
  unrealizedPnL: number | null;
  unrealizedPnLPercent: number | null;
  source: 'plaid';
  institution: string | null;
  itemId: string;
}

export interface PlaidAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  balances: {
    current: number | null;
    available: number | null;
    limit: number | null;
    currency: string;
  };
  institution: string | null;
  itemId: string;
}

export interface PlaidHoldingsResponse {
  holdings: PlaidHolding[];
  accounts: PlaidAccount[];
  totalValue: number;
  connectionCount: number;
  successCount: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL = `${NUBLE_PLATFORM_URL}/api/plaid`;
const DEFAULT_TIMEOUT = 30000;
const AUTH_TOKEN_KEY = 'auth_token';

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class PlaidClientService {
  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async getAuthToken(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const token = await this.getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `Request failed with status ${response.status}`,
        };
      }

      return data as ApiResponse<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Plaid Link Flow
  // ---------------------------------------------------------------------------

  /**
   * Create a Plaid Link token from the backend.
   * Returns a link token to be used with the hosted Plaid Link URL.
   */
  async createLinkToken(): Promise<ApiResponse<{ linkToken: string; expiration: string }>> {
    return this.request<{ linkToken: string; expiration: string }>('POST', '/link/token');
  }

  /**
   * Build the Plaid hosted Link URL for opening in the in-app browser.
   */
  getHostedLinkUrl(linkToken: string): string {
    return `https://cdn.plaid.com/link/v2/stable/link.html?isWebview=true&token=${linkToken}`;
  }

  /**
   * Exchange a public_token (from Plaid Link success) for a persistent access_token.
   */
  async exchangePublicToken(
    publicToken: string,
    institutionId?: string,
    institutionName?: string,
  ): Promise<ApiResponse<{ itemId: string; institutionName: string; accountCount: number; status: string }>> {
    return this.request<{ itemId: string; institutionName: string; accountCount: number; status: string }>(
      'POST',
      '/exchange',
      { publicToken, institutionId, institutionName },
    );
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * List all Plaid connections for the current user.
   */
  async getConnections(): Promise<ApiResponse<PlaidConnection[]>> {
    return this.request<PlaidConnection[]>('GET', '/connections');
  }

  /**
   * Remove a Plaid connection by item ID.
   */
  async removeConnection(itemId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>('DELETE', `/item/${itemId}`);
  }

  // ---------------------------------------------------------------------------
  // Holdings & Accounts
  // ---------------------------------------------------------------------------

  /**
   * Get investment holdings across all Plaid connections.
   */
  async getHoldings(): Promise<ApiResponse<PlaidHoldingsResponse>> {
    return this.request<PlaidHoldingsResponse>('GET', '/holdings');
  }

  /**
   * Get holdings for a specific Plaid item.
   */
  async getItemHoldings(itemId: string): Promise<ApiResponse<{
    holdings: PlaidHolding[];
    accounts: PlaidAccount[];
    institution: string;
  }>> {
    return this.request<{ holdings: PlaidHolding[]; accounts: PlaidAccount[]; institution: string }>(
      'GET',
      `/holdings/${itemId}`,
    );
  }

  /**
   * Get linked accounts with balances.
   */
  async getAccounts(): Promise<ApiResponse<{ accounts: PlaidAccount[]; count: number }>> {
    return this.request<{ accounts: PlaidAccount[]; count: number }>('GET', '/accounts');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: PlaidClientService | null = null;

export function getPlaidClient(): PlaidClientService {
  if (!serviceInstance) {
    serviceInstance = new PlaidClientService();
  }
  return serviceInstance;
}

export function resetPlaidClient(): void {
  serviceInstance = null;
}

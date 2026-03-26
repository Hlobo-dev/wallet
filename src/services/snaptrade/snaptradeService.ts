/**
 * SnapTrade Brokerage Connection Service (React Native)
 *
 * Adapted from the Vibe-Trading web service for React Native.
 * Handles user registration, connection portal, account management, and trading.
 *
 * Backend API: NUBLE_PLATFORM_URL/api/snaptrade/*
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NUBLE_PLATFORM_URL } from '@/screens/Chat/chatConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface SnapTradeUser {
  userId: string;
  userSecret: string;
  registeredAt: Date;
}

export interface Brokerage {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl?: string;
  isSandbox: boolean;
  enabled: boolean;
  supportsTrading: boolean;
  supportsReporting: boolean;
  authType: string;
  maintenanceMode: boolean;
  allowsTrading: boolean;
  allowsFractionalUnits: boolean;
  allowedAccountTypes: string[];
}

export interface BrokerageConnection {
  id: string;
  brokerage: Brokerage;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  disabled: boolean;
  disabledDate?: Date;
  meta?: Record<string, unknown>;
}

export interface BrokerageAccount {
  id: string;
  name: string;
  number: string;
  institutionName: string;
  connectionId: string;
  createdAt: Date;
  syncStatus: {
    holdings: { syncedAt: Date };
    transactions?: { syncedAt?: Date };
  };
  balance: {
    total?: { amount: number; currency: string };
    cash?: { amount: number; currency: string };
  };
  meta?: Record<string, unknown>;
}

export interface Position {
  symbol: string;
  symbolId: string;
  units: number;
  price: number;
  openPnl: number;
  averagePrice: number;
  fractionalUnits: number;
}

export interface Balance {
  currency: string;
  cash: number;
  marketValue: number;
  totalEquity: number;
  buyingPower: number;
}

export interface TradeRequest {
  symbol: string;
  action: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: 'DAY' | 'GTC' | 'FOK' | 'IOC';
}

export interface Order {
  id: string;
  accountId: string;
  brokerageOrderId: string;
  symbol: string;
  symbolId: string;
  action: 'BUY' | 'SELL';
  units: number;
  filledUnits: number;
  price: number;
  type: string;
  timeInForce: string;
  status: string;
  executionPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectionPortalResponse {
  redirectUri: string;
  sessionId: string;
  expiresAt: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CREDENTIALS_KEY = 'snaptrade_credentials';
const API_BASE_URL = `${NUBLE_PLATFORM_URL}/api/snaptrade`;
const DEFAULT_TIMEOUT = 30000;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class SnapTradeClientService {
  private userCredentials: { userId: string; userSecret: string } | null = null;
  private credentialsLoaded = false;

  // ---------------------------------------------------------------------------
  // Credential Management
  // ---------------------------------------------------------------------------

  async setCredentials(userId: string, userSecret: string): Promise<void> {
    this.userCredentials = { userId, userSecret };
    await AsyncStorage.setItem(CREDENTIALS_KEY, JSON.stringify(this.userCredentials));
  }

  async getCredentials(): Promise<{ userId: string; userSecret: string } | null> {
    if (this.userCredentials) {
      return this.userCredentials;
    }
    if (!this.credentialsLoaded) {
      const stored = await AsyncStorage.getItem(CREDENTIALS_KEY);
      this.credentialsLoaded = true;
      if (stored) {
        this.userCredentials = JSON.parse(stored);
        return this.userCredentials;
      }
    }
    return null;
  }

  async clearCredentials(): Promise<void> {
    this.userCredentials = null;
    this.credentialsLoaded = false;
    await AsyncStorage.removeItem(CREDENTIALS_KEY);
  }

  async isRegistered(): Promise<boolean> {
    return (await this.getCredentials()) !== null;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown> | object,
    includeCredentials = true,
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const credentials = includeCredentials ? await this.getCredentials() : null;
      const requestBody = credentials && includeCredentials ? { ...credentials, ...body } : body;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'GET' ? JSON.stringify(requestBody) : undefined,
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
  // User Management
  // ---------------------------------------------------------------------------

  async registerUser(platformUserId: string): Promise<ApiResponse<SnapTradeUser>> {
    const response = await this.request<SnapTradeUser>(
      'POST',
      '/users/register',
      { platformUserId },
      false,
    );
    if (response.success && response.data) {
      await this.setCredentials(response.data.userId, response.data.userSecret);
    }
    return response;
  }

  async deleteUser(): Promise<ApiResponse<{ deleted: boolean }>> {
    const response = await this.request<{ deleted: boolean }>('POST', '/users/delete');
    if (response.success) {
      await this.clearCredentials();
    }
    return response;
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  async generateConnectionPortal(options?: {
    brokerageSlug?: string;
    immediateRedirect?: boolean;
    customRedirectUri?: string;
    reconnect?: boolean;
    connectionType?: 'read' | 'trade';
  }): Promise<ApiResponse<ConnectionPortalResponse>> {
    return this.request<ConnectionPortalResponse>('POST', '/connections/portal', {
      brokerageSlug: options?.brokerageSlug,
      immediateRedirect: options?.immediateRedirect,
      customRedirectUri: options?.customRedirectUri,
      reconnect: options?.reconnect,
      connectionType: options?.connectionType ?? 'trade',
    });
  }

  async listConnections(): Promise<ApiResponse<BrokerageConnection[]>> {
    return this.request<BrokerageConnection[]>('POST', '/connections');
  }

  async deleteConnection(connectionId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>('POST', `/connections/${connectionId}/delete`);
  }

  async refreshConnection(connectionId: string): Promise<ApiResponse<BrokerageConnection>> {
    return this.request<BrokerageConnection>('POST', `/connections/${connectionId}/refresh`);
  }

  // ---------------------------------------------------------------------------
  // Brokerage Discovery
  // ---------------------------------------------------------------------------

  async listBrokerages(): Promise<ApiResponse<Brokerage[]>> {
    return this.request<Brokerage[]>('GET', '/brokerages', undefined, false);
  }

  // ---------------------------------------------------------------------------
  // Account Management
  // ---------------------------------------------------------------------------

  async listAccounts(): Promise<ApiResponse<BrokerageAccount[]>> {
    return this.request<BrokerageAccount[]>('POST', '/accounts');
  }

  async getPositions(accountId: string): Promise<ApiResponse<Position[]>> {
    return this.request<Position[]>('POST', `/accounts/${accountId}/positions`);
  }

  async getBalances(accountId: string): Promise<ApiResponse<Balance[]>> {
    return this.request<Balance[]>('POST', `/accounts/${accountId}/balances`);
  }

  // ---------------------------------------------------------------------------
  // Trading
  // ---------------------------------------------------------------------------

  async placeTrade(accountId: string, trade: TradeRequest): Promise<ApiResponse<Order>> {
    return this.request<Order>('POST', `/trading/${accountId}/order`, trade);
  }

  async cancelOrder(accountId: string, orderId: string): Promise<ApiResponse<{ cancelled: boolean }>> {
    return this.request<{ cancelled: boolean }>('POST', `/trading/${accountId}/orders/${orderId}/cancel`);
  }

  async getOrders(accountId: string, status?: 'open' | 'all'): Promise<ApiResponse<Order[]>> {
    return this.request<Order[]>('POST', `/trading/${accountId}/orders`, { status: status ?? 'all' });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let serviceInstance: SnapTradeClientService | null = null;

export function getSnapTradeClient(): SnapTradeClientService {
  if (!serviceInstance) {
    serviceInstance = new SnapTradeClientService();
  }
  return serviceInstance;
}

export function resetSnapTradeClient(): void {
  serviceInstance = null;
}

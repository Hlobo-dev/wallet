/**
 * Astellr Platform Auth Service
 *
 * Pure functions (no React) that communicate with the ROKET-PLATFORM
 * (Vibe-Trading) backend for authentication, and with the ROKET-CHAT
 * backend for token exchange.
 *
 * This mirrors the exact same auth flow used by the Vibe-Trading web app:
 * - POST /api/auth/register   → create account
 * - POST /api/auth/login      → sign in
 * - POST /api/auth/refresh    → refresh access token
 * - POST /api/auth/me         → get current user
 *
 * Chat integration (platform-exchange — identical to how the platform does it):
 * - POST /api/v1/auths/platform-exchange → exchange platform JWT for chat JWT
 */

import { ASTELLR_CHAT_URL, ASTELLR_PLATFORM_URL } from '@/screens/Chat/chatConfig';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlatformUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tier?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PlatformSession {
  user: PlatformUser;
  tokens: AuthTokens;
}

// ─── Platform API calls ─────────────────────────────────────────────────────

/**
 * Register a new account on the Vibe-Trading platform.
 * Exact same endpoint the web app uses.
 */
export async function platformRegister(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<PlatformSession> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    res = await fetch(`${ASTELLR_PLATFORM_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        password,
        first_name: firstName,
        last_name: lastName,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (fetchErr: any) {
    if (fetchErr?.name === 'AbortError') {
      throw new PlatformAuthError('Connection timed out. Is the server running?', 0);
    }
    throw new PlatformAuthError('Cannot connect to server. Check your network.', 0);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new PlatformAuthError(`Server error (${res.status})`, res.status);
  }

  if (!res.ok || !data.success) {
    // Extract detailed validation errors if available
    let msg = data.error ?? data.message ?? data.detail ?? 'Registration failed';
    if (Array.isArray(data.details) && data.details.length > 0) {
      msg = data.details.map((d: { field?: string; message?: string }) => d.message ?? d.field).join('\n');
    }
    throw new PlatformAuthError(msg, res.status);
  }

  const u = data.data.user;
  return {
    user: {
      id: u.id,
      email: u.email,
      firstName: u.firstName ?? u.first_name ?? '',
      lastName: u.lastName ?? u.last_name ?? '',
      tier: u.tier ?? 'free',
    },
    tokens: {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    },
  };
}

/**
 * Log in to an existing account on the Vibe-Trading platform.
 * Exact same endpoint the web app uses.
 */
export async function platformLogin(
  email: string,
  password: string,
): Promise<PlatformSession> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    res = await fetch(`${ASTELLR_PLATFORM_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        password,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (fetchErr: any) {
    if (fetchErr?.name === 'AbortError') {
      throw new PlatformAuthError('Connection timed out. Is the server running?', 0);
    }
    throw new PlatformAuthError('Cannot connect to server. Check your network.', 0);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new PlatformAuthError(`Server error (${res.status})`, res.status);
  }

  if (!res.ok || !data.success) {
    const msg =
      data.error ?? data.message ?? data.detail ?? 'Invalid credentials';
    throw new PlatformAuthError(msg, res.status);
  }

  const u = data.data.user;
  return {
    user: {
      id: u.id,
      email: u.email,
      firstName: u.first_name ?? u.firstName ?? '',
      lastName: u.last_name ?? u.lastName ?? '',
      tier: u.tier ?? 'free',
    },
    tokens: {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    },
  };
}

/**
 * Refresh the access token using the refresh token.
 * Returns a new pair of tokens (the platform rotates refresh tokens).
 */
export async function platformRefreshToken(
  refreshToken: string,
): Promise<AuthTokens> {
  const res = await fetch(`${ASTELLR_PLATFORM_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new PlatformAuthError('Session expired', res.status);
  }

  return {
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
  };
}

/**
 * Fetch the current user profile using the access token.
 * Used to re-hydrate user info from a persisted token.
 */
export async function platformGetMe(
  accessToken: string,
): Promise<PlatformUser> {
  const res = await fetch(`${ASTELLR_PLATFORM_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new PlatformAuthError('Failed to fetch profile', res.status);
  }

  const d = data.data;
  return {
    id: d.id,
    email: d.email,
    firstName: d.first_name ?? d.firstName ?? '',
    lastName: d.last_name ?? d.lastName ?? '',
    tier: d.tier ?? 'free',
  };
}

// ─── Chat token exchange ────────────────────────────────────────────────────

/**
 * Exchange a platform access token for a ROKET-CHAT JWT.
 *
 * This is the EXACT same flow used by the Vibe-Trading web app:
 *   POST /api/v1/auths/platform-exchange  { token: <platformAccessToken> }
 *
 * The ROKET-CHAT backend calls the platform's internal /api/internal/validate-token
 * endpoint to verify the token and sync/create the user, then returns a chat JWT.
 *
 * This gives tenant-isolated chat history, memory, brokerage context — everything
 * tied to the same platform user ID.
 */
export async function exchangePlatformTokenForChatToken(
  platformAccessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${ASTELLR_CHAT_URL}/api/v1/auths/platform-exchange`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: platformAccessToken }),
      },
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

// ─── OAuth (Google / Apple) ──────────────────────────────────────────────────

/**
 * The custom URL scheme used by the mobile app for OAuth callbacks.
 * The backend redirects here after the provider callback.
 *
 * Flow (embedded WebView — identical UX to VibeTradining web app):
 * 1. App opens a modal with a WebView pointing at
 *    `${ASTELLR_PLATFORM_URL}/api/oauth/social/:provider?mobile=1&redirect_scheme=astellrwallet`
 * 2. WebView shows the provider's auth page (Google, Apple, etc.) inline
 * 3. Provider redirects back to the backend callback
 * 4. Backend creates/finds user, generates JWT tokens
 * 5. Backend redirects to `astellrwallet://oauth/callback?token=...&refreshToken=...`
 * 6. WebView's onNavigationStateChange intercepts the scheme redirect
 * 7. App extracts the tokens and closes the modal — user never leaves the app
 */
export const OAUTH_CALLBACK_SCHEME = 'astellrwallet://oauth/callback';

/**
 * Build the OAuth URL for the given provider.
 * The WebView in PlatformLoginScreen will load this URL.
 */
export function getOAuthURL(provider: 'google' | 'apple'): string {
  return `${ASTELLR_PLATFORM_URL}/api/oauth/social/${provider}?mobile=1&redirect_scheme=astellrwallet`;
}

/**
 * Parse tokens (or an error) from an OAuth callback URL.
 * Returns `{ tokens }` on success, `{ error }` on failure.
 */
export function parseOAuthCallbackURL(url: string): { tokens?: AuthTokens; error?: string } {
  if (!url.startsWith(OAUTH_CALLBACK_SCHEME)) {
    return {};
  }

  try {
    const queryString = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryString);

    const error = params.get('error');
    if (error) {
      return { error: decodeURIComponent(error) };
    }

    const token = params.get('token');
    const refreshToken = params.get('refreshToken');

    if (token && refreshToken) {
      return { tokens: { accessToken: token, refreshToken } };
    }
    return { error: 'Missing authentication tokens from provider' };
  } catch {
    return { error: 'Failed to process authentication response' };
  }
}

/**
 * After receiving OAuth tokens via deep link, fetch the user profile.
 * This mirrors the VibeTradining `setTokens` function in AuthContext.
 */
export async function platformGetMeFromOAuth(accessToken: string): Promise<PlatformUser> {
  // Retry once after a short delay if rate limited (429)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${ASTELLR_PLATFORM_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const d = data.data.user || data.data;
          return {
            id: d.id,
            email: d.email,
            firstName: d.first_name ?? d.firstName ?? '',
            lastName: d.last_name ?? d.lastName ?? '',
            tier: d.tier ?? 'free',
          };
        }
      } else if (res.status === 429 && attempt === 0) {
        // Rate limited — wait 2s and retry (identical to VibeTradining)
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
    } catch {
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
    }
    break;
  }

  // Fallback: decode JWT to get minimal user info (identical to VibeTradining)
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    return {
      id: payload.userId,
      email: payload.email || '',
      firstName: payload.firstName || payload.first_name || '',
      lastName: payload.lastName || payload.last_name || '',
      tier: payload.tier || 'free',
    };
  } catch {
    throw new PlatformAuthError('Failed to fetch user profile after OAuth login', 0);
  }
}

// ─── Error class ────────────────────────────────────────────────────────────

export class PlatformAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PlatformAuthError';
    this.status = status;
  }
}

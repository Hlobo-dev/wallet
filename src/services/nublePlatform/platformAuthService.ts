/**
 * Nuble Platform Auth Service
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

import { NUBLE_CHAT_URL, NUBLE_PLATFORM_URL } from '@/screens/Chat/chatConfig';

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
  const res = await fetch(`${NUBLE_PLATFORM_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.toLowerCase().trim(),
      password,
      first_name: firstName,
      last_name: lastName,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    const msg =
      data.error ?? data.message ?? data.detail ?? 'Registration failed';
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
  const res = await fetch(`${NUBLE_PLATFORM_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.toLowerCase().trim(),
      password,
    }),
  });

  const data = await res.json();

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
  const res = await fetch(`${NUBLE_PLATFORM_URL}/api/auth/refresh`, {
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
  const res = await fetch(`${NUBLE_PLATFORM_URL}/api/auth/me`, {
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
      `${NUBLE_CHAT_URL}/api/v1/auths/platform-exchange`,
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

// ─── Error class ────────────────────────────────────────────────────────────

export class PlatformAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PlatformAuthError';
    this.status = status;
  }
}

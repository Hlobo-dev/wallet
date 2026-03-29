/**
 * NubleAuthProvider — global authentication context.
 *
 * Responsibilities:
 * 1. Persist platform credentials in iOS Keychain (AES-256, hardware-backed).
 * 2. On app launch: re-hydrate from Keychain → validate token → silent refresh.
 * 3. Expose `isAuthenticated`, `user`, `login`, `register`, `logout`.
 * 4. Provide `getChatToken()` which exchanges the platform JWT for a ROKET-CHAT
 *    JWT using the same `platform-exchange` flow the web app uses.
 * 5. Once signed in, the user is NEVER asked to sign in again (tokens auto-refresh,
 *    refresh token lasts 30 days and is rotated on each refresh).
 *
 * Keychain keys (stored via react-native-keychain `setGenericPassword`):
 *   - nuble_platform_access_token
 *   - nuble_platform_refresh_token
 *   - nuble_platform_user (JSON)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Keychain, { ACCESSIBLE } from 'react-native-keychain';
import * as WebBrowser from 'expo-web-browser';

import {
  exchangePlatformTokenForChatToken,
  getOAuthURL,
  OAUTH_CALLBACK_SCHEME,
  parseOAuthCallbackURL,
  platformGetMe,
  platformGetMeFromOAuth,
  platformLogin,
  platformRefreshToken,
  platformRegister,
  PlatformAuthError,
} from '@/services/nublePlatform';

import { NUBLE_PLATFORM_URL } from '@/screens/Chat/chatConfig';
import { resetSnapTradeClient } from '@/services/snaptrade';
import { resetPlaidClient } from '@/services/plaid';
import {
  setCurrentUserId,
  clearCurrentUserId,
  getCurrentUserId,
  clearUserScopedCaches,
  migrateUnscopedCaches,
} from '@/utils/userScopedStorage';

import type { AuthTokens, PlatformSession, PlatformUser } from '@/services/nublePlatform';

// ─── Keychain keys ──────────────────────────────────────────────────────────

const KC_ACCESS_TOKEN = 'nuble_platform_access_token';
const KC_REFRESH_TOKEN = 'nuble_platform_refresh_token';
const KC_USER = 'nuble_platform_user';

// ─── Keychain helpers ───────────────────────────────────────────────────────

async function kcSet(service: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(service, value, {
    service,
    accessible: ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function kcGet(service: string): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({ service });
    return creds ? creds.password : null;
  } catch {
    return null;
  }
}

async function kcRemove(service: string): Promise<void> {
  await Keychain.resetGenericPassword({ service });
}

async function kcClearAll(): Promise<void> {
  await Promise.all([
    kcRemove(KC_ACCESS_TOKEN),
    kcRemove(KC_REFRESH_TOKEN),
    kcRemove(KC_USER),
  ]);
}

// ─── Context ────────────────────────────────────────────────────────────────

interface NubleAuthContextValue {
  /** True once the provider has finished checking Keychain (splash-safe). */
  isReady: boolean;
  /** True if the user has a valid session. */
  isAuthenticated: boolean;
  /** The current platform user, or null. */
  user: PlatformUser | null;
  /** Sign in with email + password. Throws PlatformAuthError on failure. */
  login: (email: string, password: string) => Promise<void>;
  /** Create a new account. Throws PlatformAuthError on failure. */
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  /**
   * Start OAuth login with Google or Apple.
   * Opens an in-app WebView modal for authentication.
   */
  loginWithOAuth: (provider: 'google' | 'apple') => void;
  /** True while waiting for an OAuth callback from the browser. */
  isOAuthLoading: boolean;
  /** The currently active OAuth provider (shows the WebView modal), or null. */
  oauthProvider: 'google' | 'apple' | null;
  /** Called by the WebView modal when tokens are received. */
  handleOAuthSuccess: (tokens: AuthTokens) => Promise<void>;
  /** Called by the WebView modal on error. */
  handleOAuthError: (error: string) => void;
  /** Dismiss the OAuth WebView modal. */
  dismissOAuth: () => void;
  /** Clear all credentials and return to the login screen. */
  logout: () => Promise<void>;
  /**
   * Get a ROKET-CHAT JWT by exchanging the current platform access token.
   * Returns null if exchange fails or the user is not authenticated.
   * Handles silent token refresh automatically.
   */
  getChatToken: () => Promise<string | null>;
  /** Get the current valid platform access token (refreshes if needed). */
  getAccessToken: () => Promise<string | null>;
}

const NubleAuthContext = createContext<NubleAuthContextValue | undefined>(undefined);

export const useNubleAuth = (): NubleAuthContextValue => {
  const ctx = useContext(NubleAuthContext);
  if (!ctx) {
    throw new Error('useNubleAuth must be used within a NubleAuthProvider');
  }
  return ctx;
};

// ─── Provider ───────────────────────────────────────────────────────────────

export const NubleAuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);

  // Ref to keep the latest tokens available to callbacks without re-renders
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  // ── Persist session to Keychain ────────────────────────────────────────

  const persistSession = useCallback(async (session: PlatformSession) => {
    // ── Multi-user isolation: detect user switch ──────────────────────────
    const previousUserId = await getCurrentUserId();
    const newUserId = session.user.id;

    if (previousUserId && previousUserId !== newUserId) {
      // Different user logging in — clear the old user's cached data and
      // reset in-memory service singletons so the new user starts fresh.
      console.log(`[NubleAuth] User switch detected: ${previousUserId} → ${newUserId}`);
      await clearUserScopedCaches(previousUserId);
      resetSnapTradeClient();
      resetPlaidClient();
    }

    // Set the new user as the active user for all scoped storage
    await setCurrentUserId(newUserId);

    // Migrate any old unscoped caches to the new user's scoped keys
    await migrateUnscopedCaches(newUserId);

    setUser(session.user);
    setTokens(session.tokens);
    await Promise.all([
      kcSet(KC_ACCESS_TOKEN, session.tokens.accessToken),
      kcSet(KC_REFRESH_TOKEN, session.tokens.refreshToken),
      kcSet(KC_USER, JSON.stringify(session.user)),
    ]);
  }, []);

  const persistTokens = useCallback(async (newTokens: AuthTokens) => {
    setTokens(newTokens);
    await Promise.all([
      kcSet(KC_ACCESS_TOKEN, newTokens.accessToken),
      kcSet(KC_REFRESH_TOKEN, newTokens.refreshToken),
    ]);
  }, []);

  // ── Hydrate from Keychain on mount ─────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [storedAccessToken, storedRefreshToken, storedUserJson] = await Promise.all([
          kcGet(KC_ACCESS_TOKEN),
          kcGet(KC_REFRESH_TOKEN),
          kcGet(KC_USER),
        ]);

        if (!storedAccessToken || !storedRefreshToken || !storedUserJson) {
          // No stored session — user needs to log in
          if (!cancelled) {
            setIsReady(true);
          }
          return;
        }

        // We have stored credentials — try to validate the access token
        let currentUser: PlatformUser | null = null;
        let currentTokens: AuthTokens = {
          accessToken: storedAccessToken,
          refreshToken: storedRefreshToken,
        };

        // Helper: race a promise against a timeout so hydration never hangs
        const withTimeout = <T,>(p: Promise<T>, ms = 5000): Promise<T> =>
          Promise.race([
            p,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Hydration timeout')), ms),
            ),
          ]);

        try {
          // Try to fetch current user with stored access token
          currentUser = await withTimeout(platformGetMe(storedAccessToken));
        } catch (e) {
          // Access token might be expired — try to refresh
          if (e instanceof PlatformAuthError && (e.status === 401 || e.status === 403)) {
            try {
              const refreshed = await withTimeout(platformRefreshToken(storedRefreshToken));
              currentTokens = refreshed;
              currentUser = await withTimeout(platformGetMe(refreshed.accessToken));
              // Persist the new rotated tokens
              if (!cancelled) {
                await persistTokens(refreshed);
              }
            } catch {
              // Refresh also failed — session is truly dead, clear everything
              await kcClearAll();
            }
          } else {
            // Network error or timeout — use cached user data optimistically
            try {
              currentUser = JSON.parse(storedUserJson);
            } catch {
              // Corrupted cache
              await kcClearAll();
            }
          }
        }

        if (!cancelled) {
          if (currentUser) {
            // Set the active user for scoped storage before anything else renders
            await setCurrentUserId(currentUser.id);
            setUser(currentUser);
            setTokens(currentTokens);
          }
          setIsReady(true);
        }
      } catch {
        // Fatal error during hydration — start fresh
        await kcClearAll();
        if (!cancelled) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Login ──────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await platformLogin(email, password);
      await persistSession(session);
    },
    [persistSession],
  );

  // ── Register ───────────────────────────────────────────────────────────

  const register = useCallback(
    async (email: string, password: string, firstName: string, lastName: string) => {
      const session = await platformRegister(email, password, firstName, lastName);
      await persistSession(session);
    },
    [persistSession],
  );

  // ── OAuth (Google / Apple) — embedded WebView approach ──────────────

  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState<'google' | 'apple' | null>(null);

  /**
   * Called by the OAuth WebView modal when tokens are received.
   * The modal intercepts the `nublewallet://oauth/callback` redirect,
   * parses tokens, and passes them here.
   */
  const handleOAuthSuccess = useCallback(
    async (oauthTokens: AuthTokens) => {
      setOAuthProvider(null);
      setIsOAuthLoading(true);
      try {
        const oauthUser = await platformGetMeFromOAuth(oauthTokens.accessToken);
        const session: PlatformSession = {
          user: oauthUser,
          tokens: oauthTokens,
        };
        await persistSession(session);
      } catch {
        // Failed to fetch user profile — still store tokens
        await persistTokens(oauthTokens);
      }
      setIsOAuthLoading(false);
    },
    [persistSession, persistTokens],
  );

  const handleOAuthError = useCallback((_error: string) => {
    setOAuthProvider(null);
    setIsOAuthLoading(false);
  }, []);

  /** Opens the system auth browser for the given provider (ASWebAuthenticationSession on iOS). */
  const loginWithOAuth = useCallback(
    async (provider: 'google' | 'apple') => {
      setOAuthProvider(provider);
      setIsOAuthLoading(true);
      try {
        const url = getOAuthURL(provider);
        // ASWebAuthenticationSession on iOS — Google allows this (unlike embedded WebViews)
        const result = await WebBrowser.openAuthSessionAsync(url, 'nublewallet://oauth/callback');

        if (result.type === 'success' && result.url) {
          const parsed = parseOAuthCallbackURL(result.url);
          if (parsed.tokens) {
            await handleOAuthSuccess(parsed.tokens);
            return;
          }
          if (parsed.error) {
            handleOAuthError(parsed.error);
            return;
          }
        }
        // User cancelled or dismissed
        setOAuthProvider(null);
        setIsOAuthLoading(false);
      } catch (e: any) {
        handleOAuthError(e?.message || 'OAuth failed');
      }
    },
    [handleOAuthSuccess, handleOAuthError],
  );

  const dismissOAuth = useCallback(() => {
    setOAuthProvider(null);
    setIsOAuthLoading(false);
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    // Best-effort server-side logout (don't block on failure)
    const currentTokens = tokensRef.current;
    if (currentTokens) {
      try {
        await fetch(`${NUBLE_PLATFORM_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentTokens.accessToken}`,
          },
          body: JSON.stringify({ refreshToken: currentTokens.refreshToken }),
        });
      } catch {
        // Ignore — local cleanup is sufficient
      }
    }

    // ── Multi-user isolation: clear all user-scoped caches ───────────────
    await clearUserScopedCaches();

    // Reset service singletons so the next user starts with clean state
    resetSnapTradeClient();
    resetPlaidClient();

    // Clear the active user ID
    await clearCurrentUserId();

    setUser(null);
    setTokens(null);
    await kcClearAll();
  }, []);

  // ── Get valid access token (refresh if needed) ─────────────────────────

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const currentTokens = tokensRef.current;
    if (!currentTokens) {
      return null;
    }

    // Try using the current token first (optimistic)
    try {
      await platformGetMe(currentTokens.accessToken);
      return currentTokens.accessToken;
    } catch (e) {
      if (e instanceof PlatformAuthError && (e.status === 401 || e.status === 403)) {
        // Expired — refresh
        try {
          const refreshed = await platformRefreshToken(currentTokens.refreshToken);
          await persistTokens(refreshed);
          return refreshed.accessToken;
        } catch {
          // Refresh failed — session dead
          await logout();
          return null;
        }
      }
      // Network error — return current token anyway (it might work)
      return currentTokens.accessToken;
    }
  }, [persistTokens, logout]);

  // ── Get ROKET-CHAT token via platform-exchange ─────────────────────────

  const getChatToken = useCallback(async (): Promise<string | null> => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return null;
    }
    return exchangePlatformTokenForChatToken(accessToken);
  }, [getAccessToken]);

  // ── Context value ──────────────────────────────────────────────────────

  const value = useMemo<NubleAuthContextValue>(
    () => ({
      isReady,
      isAuthenticated: !!user && !!tokens,
      user,
      login,
      register,
      loginWithOAuth,
      isOAuthLoading,
      oauthProvider,
      handleOAuthSuccess,
      handleOAuthError,
      dismissOAuth,
      logout,
      getChatToken,
      getAccessToken,
    }),
    [isReady, user, tokens, login, register, loginWithOAuth, isOAuthLoading, oauthProvider, handleOAuthSuccess, handleOAuthError, dismissOAuth, logout, getChatToken, getAccessToken],
  );

  return (
    <NubleAuthContext.Provider value={value}>
      {children}
    </NubleAuthContext.Provider>
  );
};

/**
 * User-Scoped Storage Utilities
 *
 * Provides helpers for multi-user data isolation in AsyncStorage.
 * All per-user cache keys are prefixed with the platform user ID so that
 * switching accounts never leaks data between users.
 *
 * This mirrors the approach used in the Vibe-Trading web app where each
 * user's SnapTrade credentials and cached positions are kept separate.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Current user tracking ──────────────────────────────────────────────────

const CURRENT_USER_ID_KEY = '__astellr_current_user_id';

let _currentUserId: string | null = null;

/**
 * Set the active user ID. Must be called on login / hydration.
 * All scoped cache keys will use this ID as a prefix.
 */
export async function setCurrentUserId(userId: string): Promise<void> {
  _currentUserId = userId;
  await AsyncStorage.setItem(CURRENT_USER_ID_KEY, userId);
}

/**
 * Get the current user ID (in-memory first, then AsyncStorage fallback).
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (_currentUserId) {
    return _currentUserId;
  }
  _currentUserId = await AsyncStorage.getItem(CURRENT_USER_ID_KEY);
  return _currentUserId;
}

/**
 * Clear the current user ID (on logout).
 */
export async function clearCurrentUserId(): Promise<void> {
  _currentUserId = null;
  await AsyncStorage.removeItem(CURRENT_USER_ID_KEY);
}

// ─── Scoped key helpers ─────────────────────────────────────────────────────

/**
 * All AsyncStorage keys that store per-user data.
 * These are the BASE keys — the actual stored key is `${userId}:${baseKey}`.
 */
export const USER_SCOPED_KEYS = {
  SNAPTRADE_CREDENTIALS: 'snaptrade_credentials',
  BROKERAGE_POSITIONS_CACHE: 'brokerage_positions_cache',
  WEALTH_POSITIONS_CACHE: 'wealth_positions_cache',
  CONNECTED_ACCOUNTS_CACHE: 'connected_accounts_cache',
} as const;

/**
 * Build a user-scoped AsyncStorage key.
 * Format: `user:<userId>:<baseKey>`
 *
 * If no userId is provided, falls back to the global key (for backward compat
 * during the migration period — but this should rarely happen).
 */
export function scopedKey(baseKey: string, userId?: string | null): string {
  const id = userId || _currentUserId;
  if (!id) {
    console.warn(`[userScopedStorage] No userId available for key "${baseKey}", using global key`);
    return baseKey;
  }
  return `user:${id}:${baseKey}`;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Clear ALL per-user caches for a specific user (or current user).
 * Called on logout to ensure the next user doesn't see stale data.
 */
export async function clearUserScopedCaches(userId?: string): Promise<void> {
  const id = userId || _currentUserId;

  const keysToRemove: string[] = [];

  // Remove scoped keys for this user
  if (id) {
    for (const baseKey of Object.values(USER_SCOPED_KEYS)) {
      keysToRemove.push(scopedKey(baseKey, id));
    }
  }

  // Also remove the old global (unscoped) keys to clean up legacy data
  for (const baseKey of Object.values(USER_SCOPED_KEYS)) {
    keysToRemove.push(baseKey);
  }

  try {
    await AsyncStorage.multiRemove(keysToRemove);
  } catch {
    // Best effort
  }
}

/**
 * Migrate old unscoped cache keys to scoped keys for the given user.
 * Called once on login — if global keys exist but scoped ones don't,
 * we move the data over.
 */
export async function migrateUnscopedCaches(userId: string): Promise<void> {
  try {
    for (const baseKey of Object.values(USER_SCOPED_KEYS)) {
      const globalValue = await AsyncStorage.getItem(baseKey);
      if (globalValue) {
        const userKey = scopedKey(baseKey, userId);
        const existingScoped = await AsyncStorage.getItem(userKey);
        if (!existingScoped) {
          // Only migrate if scoped key doesn't already exist
          await AsyncStorage.setItem(userKey, globalValue);
        }
        // Remove the old global key
        await AsyncStorage.removeItem(baseKey);
      }
    }
  } catch {
    // Best effort
  }
}

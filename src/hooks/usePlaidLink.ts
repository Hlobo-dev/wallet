/**
 * 🏦 usePlaidLink Hook (React Native)
 *
 * React Native equivalent of the Vibe-Trading web app's usePlaid hook.
 * Uses the official react-native-plaid-link-sdk to open the native Plaid Link
 * modal instead of the hosted URL in a WebView.
 *
 * Flow:
 *   1. Request a link_token from the backend (POST /api/plaid/link/token)
 *   2. Open the native Plaid Link SDK with that token
 *   3. On success, exchange the public_token via deep link handler
 */
import { useCallback, useState } from 'react';
import { create, open, dismissLink, LinkIOSPresentationStyle } from 'react-native-plaid-link-sdk';
import type { LinkSuccess, LinkExit } from 'react-native-plaid-link-sdk';

import { getPlaidClient } from '@/services/plaid';
import { useAstellrAuth } from '@/providers/AstellrAuthProvider';

export function usePlaidLink() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = useAstellrAuth();

  const openPlaidLink = useCallback(async (
    onSuccess?: (publicToken: string, institutionId?: string, institutionName?: string) => void,
    onExit?: () => void,
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Get the auth token and set it on the Plaid client
      const token = await getAccessToken();
      if (!token) {
        setError('Not authenticated. Please log in first.');
        setIsLoading(false);
        return;
      }

      const plaidClient = getPlaidClient();
      plaidClient.setAuthToken(token);

      // 2. Request a link token from the backend
      const result = await plaidClient.createLinkToken();
      if (!result.success || !result.data?.linkToken) {
        setError(result.error || 'Failed to create Plaid link token');
        setIsLoading(false);
        return;
      }

      const linkToken = result.data.linkToken;

      // 3. Create and open Plaid Link with the native SDK
      const linkOpenConfig = {
        onSuccess: (success: LinkSuccess) => {
          const publicToken = success.publicToken;
          const institution = success.metadata?.institution;
          onSuccess?.(
            publicToken,
            institution?.id,
            institution?.name,
          );
        },
        onExit: (exit: LinkExit) => {
          if (exit.error) {
            setError(exit.error.displayMessage || exit.error.errorMessage || 'Plaid Link error');
          }
          onExit?.();
        },
        iOSPresentationStyle: LinkIOSPresentationStyle.MODAL,
      };

      create({ token: linkToken });
      open(linkOpenConfig);
    } catch (err: any) {
      setError(err.message || 'Failed to open Plaid Link');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  return {
    openPlaidLink,
    isLoading,
    error,
    dismissLink,
  };
}

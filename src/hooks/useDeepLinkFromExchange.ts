import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';

import { Linking } from 'react-native';

import { showToast } from '@/components/Toast';
import { useGlobalState } from '@/components/GlobalState';
import { Routes } from '@/Routes';
import { getSnapTradeClient } from '@/services/snaptrade';
import { getPlaidClient } from '@/services/plaid';

import { hapticFeedback } from '@/utils/hapticFeedback';

export const useDeepLinkFromExchange = () => {
  const navigation = useNavigation();
  const [, setOpenAccountSheet] = useGlobalState('openAccountSheet');
  const handleURL = useCallback(
    async (url: string) => {
      const parsedUrl = new URL(url);
      const params = new URLSearchParams(parsedUrl.search);

      if (parsedUrl?.hostname === 'krakenconnect') {
        const code = params.get('code');
        const state = params.get('state');
        const connectionError = params.get('error');
        navigation.navigate(Routes.KrakenConnect, {
          code,
          state,
          connectionError,
        });
      }

      // SnapTrade callback: krakenwallet://snaptrade?status=SUCCESS&connectionId=...
      if (parsedUrl?.hostname === 'snaptrade') {
        const status = params.get('status');
        const connectionId = params.get('connectionId');

        if (status === 'SUCCESS' || connectionId) {
          hapticFeedback.notificationSuccess();
          showToast({ type: 'success', text: 'Brokerage connected successfully' });
          // Verify the connection exists
          try {
            const client = getSnapTradeClient();
            await client.listConnections();
          } catch {
            // Silently continue — connection was likely created
          }
          // Navigate to Home and open the Accounts sheet
          navigation.navigate(Routes.Home);
          setOpenAccountSheet(true);
        } else {
          showToast({ type: 'error', text: 'Brokerage connection failed' });
        }
      }

      // Plaid callback: krakenwallet://plaid?public_token=...&institution_id=...
      if (parsedUrl?.hostname === 'plaid') {
        const publicToken = params.get('public_token');
        const institutionId = params.get('institution_id');
        const institutionName = params.get('institution_name');

        if (publicToken) {
          try {
            const client = getPlaidClient();
            const result = await client.exchangePublicToken(
              publicToken,
              institutionId ?? undefined,
              institutionName ?? undefined,
            );
            if (result.success) {
              hapticFeedback.notificationSuccess();
              showToast({ type: 'success', text: `${institutionName ?? 'Account'} connected successfully` });
              // Navigate to Home and open the Accounts sheet
              navigation.navigate(Routes.Home);
              setOpenAccountSheet(true);
            } else {
              showToast({ type: 'error', text: 'Failed to save wealth account connection' });
            }
          } catch {
            showToast({ type: 'error', text: 'Failed to save wealth account connection' });
          }
        } else {
          const error = params.get('error');
          if (error) {
            showToast({ type: 'error', text: 'Wealth account connection failed' });
          }
        }
      }
    },
    [navigation, setOpenAccountSheet],
  );
  useEffect(() => {
    const listener = Linking.addEventListener('url', (event: { url: string }) => {
      const url = event.url;
      handleURL(url);
    });
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleURL(initialUrl);
      }
    };
    handleInitialURL();
    return () => {
      listener.remove();
    };
  }, [handleURL]);
};

import { BottomSheetFooter, BottomSheetView, useBottomSheetModal } from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import { forwardRef, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BottomSheetModalRef } from '@/components/BottomSheet';
import { BottomSheetModal } from '@/components/BottomSheet';

import { Button } from '@/components/Button';
import { ConnectedAccountItem } from '@/components/ConnectedAccountItem';
import { FloatingBottomButtons } from '@/components/FloatingBottomButtons';
import { Label } from '@/components/Label';
import { showToast } from '@/components/Toast';
import { useBottomSheetPadding } from '@/hooks/useBottomSheetPadding';
import type { ConnectedAccount } from '@/hooks/useConnectedAccounts';
import { useConnectedAccounts } from '@/hooks/useConnectedAccounts';
import { useManageAccount } from '@/hooks/useManageAccount';
import { Routes } from '@/Routes';
import { getSnapTradeClient } from '@/services/snaptrade';
import { getPlaidClient } from '@/services/plaid';
import { WalletBackupWarning } from '@/screens/Settings/walletBackup';
import { useIsOnline } from '@/utils/useConnectionManager';

import type { BottomSheetFooterProps } from '@gorhom/bottom-sheet';

import loc from '/loc';

const creatingNewWalletEvent = 'creatingNewWallet';
export const showCreateNewWalletToast = async () =>
  showToast({
    type: 'info',
    text: loc.accountSwitch.creatingNewWallet,
    id: creatingNewWalletEvent,
    dismissMode: 'event',
    iconLottieSource: require('@/assets/lottie/refreshSpinner.json'),
  });

const ACCOUNT_SWITCH_MODAL = 'ACCOUNT_SWITCH_MODAL';

export const AccountSwitchSheet = forwardRef<BottomSheetModalRef>((_, ref) => {
  const navigation = useNavigation();
  const { createAccount } = useManageAccount();
  const isOnline = useIsOnline();
  const { dismiss } = useBottomSheetModal();
  const { connectedAccounts, refetch: refetchConnectedAccounts } = useConnectedAccounts();

  const dismissModal = useCallback(() => dismiss(ACCOUNT_SWITCH_MODAL), [dismiss]);

  useEffect(() => {
    navigation.addListener('blur', dismissModal);
    return () => navigation.removeListener('blur', dismissModal);
  }, [navigation, dismissModal]);

  const handleManagePress = () => {
    navigation.navigate(Routes.Settings, { screen: Routes.ManageWallets });
  };

  const handleRemoveConnectedAccount = useCallback(
    async (account: ConnectedAccount) => {
      try {
        if (account.type === 'brokerage') {
          const client = getSnapTradeClient();
          await client.deleteConnection(account.connectionId);
        } else {
          const client = getPlaidClient();
          await client.removeConnection(account.connectionId);
        }
        refetchConnectedAccounts();
        showToast({ type: 'success', text: `${account.name} disconnected` });
      } catch {
        showToast({ type: 'error', text: `Failed to disconnect ${account.name}` });
      }
    },
    [refetchConnectedAccounts],
  );

  const handleBottomSheetChange = (index: number) => {
    if (index > -1) {
      refetchConnectedAccounts();
    }
  };

  const marginBottom = useBottomSheetPadding(false);

  const handleCreateNewAccount = useCallback(async () => {
    if (isOnline) {
      dismissModal();
      createAccount();
    }
  }, [isOnline, dismissModal, createAccount]);

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <FloatingBottomButtons
          primary={{
            disabled: !isOnline,
            text: loc.accountSwitch.createWallet,
            onPress: handleCreateNewAccount,
            testID: 'CreateWalletButton',
            color: 'light100',
            textColor: 'dark100',
          }}
          bottomSpace={0}
          useBottomInset={false}
          style={styles.footerButtons}
        />
      </BottomSheetFooter>
    ),
    [isOnline, handleCreateNewAccount],
  );

  return (
    <BottomSheetModal enableDynamicSizing name={ACCOUNT_SWITCH_MODAL} onChange={handleBottomSheetChange} ref={ref} footerComponent={renderFooter}>
      <BottomSheetView>
        <View style={[styles.header, styles.container]} testID="ManageButtonHeader">
          <Label>{loc.accountSwitch.wallets}</Label>
          <Button text={loc.accountSwitch.manage} onPress={handleManagePress} testID="EditAccountManageButton" />
        </View>
        <View style={styles.container}>
          <WalletBackupWarning showDismissable={false} />
        </View>
        {connectedAccounts.length > 0 && (
          <View style={[styles.container, { marginBottom }]}>
            {connectedAccounts.map((ca, index) => (
              <ConnectedAccountItem
                key={ca.id}
                account={ca}
                isFirst={index === 0}
                isLast={index === connectedAccounts.length - 1}
                backgroundType="modal"
                onRemove={handleRemoveConnectedAccount}
              />
            ))}
          </View>
        )}
        <View style={styles.footerSpacer} />
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
  },
  header: {
    marginVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerSpacer: {
    height: 120,
  },
  footerButtons: {
    paddingBottom: 24,
  },
});

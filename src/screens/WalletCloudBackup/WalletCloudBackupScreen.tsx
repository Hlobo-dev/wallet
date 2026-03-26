import { useCallback, useRef, useState } from 'react';

import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import DeviceInfo from 'react-native-device-info';

import { GradientItemBackground } from '@/components/GradientItemBackground';
import { GradientScreenView } from '@/components/Gradients';
import { Label } from '@/components/Label';
import { SvgIcon } from '@/components/SvgIcon';
import { useBrowser } from '@/hooks/useBrowser';
import { useWalletBackupSettings } from '@/hooks/useWalletBackupSettings';
import { useLanguage } from '@/realm/settings';
import type { NavigationProps } from '@/Routes';
import { Routes } from '@/Routes';
import { useSecuredKeychain } from '@/secureStore/SecuredKeychainProvider';
import { BROKERAGES, type BrokerageInfo } from '@/services/snaptrade';
import { getSnapTradeClient } from '@/services/snaptrade';
import { getPlaidClient } from '@/services/plaid';
import { WEALTH_INSTITUTIONS, type WealthInstitution } from '@/services/plaid';
import { hapticFeedback } from '@/utils/hapticFeedback';
import { navigationStyle } from '@/utils/navigationStyle';
import { runAfterUISync } from '@/utils/runAfterUISync';

import { CloudBackupErrorSheet } from './components/CloudBackupErrorSheet';

import { CloudBackupSuccessSheet } from './components/CloudBackupSuccessSheet';

import { getBackupName } from './utils/getBackupName';

import type { PasskeyErrorType } from './components/CloudBackupErrorSheet';
import type { CloudBackupSuccessSheetRef } from './components/CloudBackupSuccessSheet';

import { handleError } from '/helpers/errorHandler';
import loc from '/loc';
import { getDateLocale } from '/loc/date';
import type { CloudBackupMetadata } from '/modules/cloud-backup';
import { CloudBackupError, CloudBackupManager } from '/modules/cloud-backup';

type PendingBackup = {
  credentialID: string;
  backupDate: Date;
  backupName: string;
};

export const WalletCloudBackupScreen = ({ navigation, route }: NavigationProps<'SettingsWalletCloudBackup' | 'OnboardingWalletCloudBackup'>) => {
  const { isManualBackupCompleted, isCloudBackupCompleted, setCloudBackupCompleted } = useWalletBackupSettings();
  const { getMnemonic } = useSecuredKeychain();
  const [passkeyError, setPasskeyError] = useState<PasskeyErrorType>();
  const [pendingBackup, setPendingBackup] = useState<PendingBackup>();

  const language = useLanguage();

  const successSheetRef = useRef<CloudBackupSuccessSheetRef>(null);

  // Determine which mode to show based on route params
  const mode = route.params?.mode ?? 'brokerage';

  const saveBackupMetadata = async (metadata: CloudBackupMetadata) => {
    try {
      await CloudBackupManager.addKnownBackup(metadata);
    } catch (e) {
      if (e instanceof Error && e.code !== CloudBackupError.synchronization_failed) {
        throw e;
      }
    }
  };

  const writePasskeyData = async ({ credentialID, backupDate, backupName }: PendingBackup) => {
    try {
      const { secret: mnemonic } = await getMnemonic(true);
      await CloudBackupManager.writeData(credentialID, mnemonic);
    } catch (e) {
      if (e instanceof Error) {
        switch (e.code) {
          case CloudBackupError.no_credentials_found: {
            setPasskeyError('passkeyErrorWritingWrongDevice');
            setPendingBackup(undefined);
            return;
          }
          case CloudBackupError.user_canceled: {
            setPasskeyError('passkeyErrorUserCanceledRegistration');
            return;
          }
        }
      }
      throw e;
    }
    const deviceName = DeviceInfo.getModel() || DeviceInfo.getDeviceNameSync();
    const backup: CloudBackupMetadata = {
      credentialID,
      device: deviceName,
      name: backupName,
      date: backupDate,
    };
    saveBackupMetadata(backup);
    setCloudBackupCompleted(credentialID);
    runAfterUISync(() => {
      hapticFeedback.notificationSuccess();
      successSheetRef.current?.present(() => {
        successSheetRef.current?.close();
        if (route.params?.origin === Routes.OnboardingBackupPrompt) {
          navigation.navigate(isManualBackupCompleted ? Routes.OnboardingSecureWallet : Routes.OnboardingBackupPrompt);
        } else {
          navigation.goBack();
        }
      });
    });
  };

  const createPasskey = async () => {
    try {
      const backupDate = new Date();
      const backupName = getBackupName(backupDate, getDateLocale(language));
      const result = await CloudBackupManager.register(backupName);
      const newPendingBackup: PendingBackup = {
        credentialID: result.credentialID,
        backupDate,
        backupName,
      };
      setPendingBackup(newPendingBackup);
      await writePasskeyData(newPendingBackup);
    } catch (e) {
      if (e instanceof Error && e.code === CloudBackupError.user_canceled) {
        navigation.goBack();
      } else {
        handleError(e, 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
        setPasskeyError('passkeyErrorWriting');
        setPendingBackup(undefined);
      }
    }
  };

  const clearError = () => setPasskeyError(undefined);

  const runBackupFlow = () => {
    clearError();
    if (pendingBackup) {
      writePasskeyData(pendingBackup);
    } else {
      createPasskey();
    }
  };

  // ---------------------------------------------------------------------------
  // SnapTrade brokerage connection
  // ---------------------------------------------------------------------------

  const snaptradeClient = getSnapTradeClient();
  const plaidClient = getPlaidClient();
  const { openURL } = useBrowser();
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [connectedSlug, setConnectedSlug] = useState<string | null>(null);
  const [connectingWealthId, setConnectingWealthId] = useState<string | null>(null);
  const [connectedWealthId, setConnectedWealthId] = useState<string | null>(null);

  const handleConnectBrokerage = useCallback(
    async (brokerage: BrokerageInfo) => {
      if (connectingSlug) {
        return;
      }
      setConnectingSlug(brokerage.slug);

      try {
        // Ensure user is registered with SnapTrade
        if (!(await snaptradeClient.isRegistered())) {
          const deviceId = await DeviceInfo.getUniqueId();
          const regResult = await snaptradeClient.registerUser(deviceId);
          if (!regResult.success) {
            handleError(new Error(regResult.error ?? 'SnapTrade registration failed'), 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
            setConnectingSlug(null);
            return;
          }
        }

        // Generate the connection portal URL
        const portalResult = await snaptradeClient.generateConnectionPortal({
          brokerageSlug: brokerage.slug,
          connectionType: 'trade',
        });

        if (!portalResult.success || !portalResult.data) {
          handleError(
            new Error(portalResult.error ?? 'Failed to generate connection portal'),
            'ERROR_CONTEXT_PLACEHOLDER',
            'generic',
          );
          setConnectingSlug(null);
          return;
        }

        // Open the SnapTrade OAuth page inside the in-app browser
        openURL(portalResult.data.redirectUri);

        hapticFeedback.notificationSuccess();
        setConnectedSlug(brokerage.slug);
      } catch (e) {
        handleError(e, 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
      } finally {
        setConnectingSlug(null);
      }
    },
    [connectingSlug, openURL, snaptradeClient],
  );

  const renderBrokerageItem = (brokerage: BrokerageInfo) => {
    const isConnecting = connectingSlug === brokerage.slug;
    const isConnected = connectedSlug === brokerage.slug;

    return (
      <TouchableOpacity
        key={brokerage.slug}
        style={styles.brokerageRow}
        activeOpacity={0.7}
        onPress={() => handleConnectBrokerage(brokerage)}
        disabled={isConnecting}>
        {/* Logo — white bg circle matching Vibe-Trading style */}
        <View style={[styles.brokerageAvatar, brokerage.needsWhiteBg ? styles.avatarWhiteBg : styles.avatarDefaultBg]}>
          <Image
            source={brokerage.logo}
            style={brokerage.useContain ? styles.brokerageLogoContain : styles.brokerageLogoCover}
            resizeMode={brokerage.useContain ? 'contain' : 'cover'}
          />
        </View>

        {/* Name */}
        <Label type="boldBody" style={styles.brokerageName}>
          {brokerage.name}
        </Label>

        {/* Status indicator */}
        {isConnecting ? (
          <ActivityIndicator size="small" color="#667eea" />
        ) : isConnected ? (
          <SvgIcon name="check-circle-filled" size={20} color="green400" />
        ) : (
          <SvgIcon name="chevron-right" size={20} color="light50" />
        )}
      </TouchableOpacity>
    );
  };

  // ---------------------------------------------------------------------------
  // Plaid wealth account connection
  // ---------------------------------------------------------------------------

  const handleConnectWealth = useCallback(
    async (_institution: WealthInstitution) => {
      if (connectingWealthId) {
        return;
      }
      setConnectingWealthId(_institution.id);

      try {
        // Get a Plaid Link token from the backend
        const tokenResult = await plaidClient.createLinkToken();

        if (!tokenResult.success || !tokenResult.data) {
          handleError(
            new Error(tokenResult.error ?? 'Failed to create Plaid link token'),
            'ERROR_CONTEXT_PLACEHOLDER',
            'generic',
          );
          setConnectingWealthId(null);
          return;
        }

        // Open the Plaid hosted Link page inside the in-app browser
        const hostedUrl = plaidClient.getHostedLinkUrl(tokenResult.data.linkToken);
        openURL(hostedUrl);

        hapticFeedback.notificationSuccess();
        setConnectedWealthId(_institution.id);
      } catch (e) {
        handleError(e, 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
      } finally {
        setConnectingWealthId(null);
      }
    },
    [connectingWealthId, openURL, plaidClient],
  );

  const renderWealthItem = (institution: WealthInstitution) => {
    const isConnecting = connectingWealthId === institution.id;
    const isConnected = connectedWealthId === institution.id;

    return (
      <TouchableOpacity
        key={institution.id}
        style={styles.brokerageRow}
        activeOpacity={0.7}
        onPress={() => handleConnectWealth(institution)}
        disabled={isConnecting}>
        {/* Fallback letter avatar — matching Vibe-Trading PlaidConnector style */}
        <View style={[styles.brokerageAvatar, styles.avatarDefaultBg]}>
          <Label type="boldBody" style={{ color: institution.color }}>
            {institution.fallback}
          </Label>
        </View>

        {/* Name */}
        <Label type="boldBody" style={styles.brokerageName}>
          {institution.name}
        </Label>

        {/* Status indicator */}
        {isConnecting ? (
          <ActivityIndicator size="small" color="#667eea" />
        ) : isConnected ? (
          <SvgIcon name="check-circle-filled" size={20} color="green400" />
        ) : (
          <SvgIcon name="chevron-right" size={20} color="light50" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <GradientScreenView>
      <Image style={styles.image} source={require('./images/PasskeyIllustration.png')} />
      <View style={styles.titleContainer}>
        <Label type="boldDisplay4">
          {mode === 'wealth' ? 'Link Wealth Accounts' : 'Connect a brokerage'}
        </Label>
        <Label type="regularBody" color="light75">
          {mode === 'wealth'
            ? 'Read-only tracking of your wealth management accounts via Plaid.'
            : 'Link your brokerage account to track your portfolio, view positions, and trade — all from one place.'}
        </Label>
      </View>
      <View style={styles.container}>
        <GradientItemBackground />
        {mode === 'wealth' ? (
          <ScrollView style={styles.brokerageList} showsVerticalScrollIndicator={false}>
            {WEALTH_INSTITUTIONS.map(renderWealthItem)}
          </ScrollView>
        ) : (
          <ScrollView style={styles.brokerageList} showsVerticalScrollIndicator={false}>
            {BROKERAGES.map(renderBrokerageItem)}
          </ScrollView>
        )}
        {mode === 'wealth' && (
          <View style={styles.plaidFooter}>
            <SvgIcon name="shield-tick" size={14} color="light50" />
            <Label type="regularCaption1" color="light50" style={styles.plaidFooterText}>
              Secured by Plaid · Bank-level encryption · Read-only
            </Label>
          </View>
        )}
      </View>
      <CloudBackupSuccessSheet ref={successSheetRef} />
      {!!passkeyError && <CloudBackupErrorSheet type={passkeyError} onClose={clearError} onRetry={runBackupFlow} />}
    </GradientScreenView>
  );
};

const styles = StyleSheet.create({
  image: {
    alignSelf: 'center',
  },
  titleContainer: {
    marginHorizontal: 16,
    padding: 12,
    gap: 8,
  },
  container: {
    padding: 16,
    margin: 12,
    borderRadius: 34,
    overflow: 'hidden',
    maxHeight: 420,
  },
  brokerageList: {
    flexGrow: 0,
  },
  brokerageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  brokerageAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarWhiteBg: {
    backgroundColor: '#FFFFFF',
  },
  avatarDefaultBg: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  brokerageLogoCover: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  brokerageLogoContain: {
    width: 28,
    height: 28,
  },
  brokerageName: {
    flex: 1,
  },
  plaidFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  plaidFooterText: {
    fontSize: 11,
  },
});

WalletCloudBackupScreen.navigationOptions = navigationStyle({
  headerTransparent: true,
  title: '',
});

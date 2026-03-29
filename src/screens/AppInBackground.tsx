import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, StyleSheet } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

import { GradientScreenView } from '@/components/Gradients';
import { useTheme } from '@/theme/themes';

import { biometricUnlock } from '/helpers/biometric-unlock';
import loc from '/loc';
import BootTime from '/modules/boot-time';

const maxLockTimeWithoutBioCheck = 1000 * 60;

interface Props {
  appState: string;
}

export const AppInBackground = ({ appState }: Props) => {
  const { colors } = useTheme();
  const [isLocked, setIsLocked] = useState(false);

  const lastLockTime = useRef<number>(0);
  const alertVisible = useRef<boolean>(false);

  const requestUnlock = useCallback(async () => {
    if (!isLocked || alertVisible.current) {
      return;
    }
    const now = await BootTime.getTimeSinceBooted();
    if (now - lastLockTime.current > maxLockTimeWithoutBioCheck) {
      if (!(await biometricUnlock())) {
        alertVisible.current = true;
        Alert.alert(loc.appLock.authenticationCancelled, loc.appLock.authenticationCancelledDescription, [
          {
            text: loc.passwordProtection.retry,
            style: 'default',
            onPress: () => {
              alertVisible.current = false;
              requestUnlock();
            },
          },
        ]);
        return;
      }
    }
    setIsLocked(false);
    lastLockTime.current = 0;
  }, [isLocked]);

  const requestLock = useCallback(async () => {
    if (isLocked) {
      return;
    }
    setIsLocked(true);
    if (!lastLockTime.current) {
      lastLockTime.current = await BootTime.getTimeSinceBooted();
    }
  }, [isLocked]);

  useEffect(() => {
    switch (appState) {
      case 'active': {
        if (isLocked) {
          requestUnlock();
        }
        break;
      }
      case 'background': {
        if (!isLocked) {
          requestLock();
        }
      }
    }
  }, [appState, isLocked, requestLock, requestUnlock]);

  const showPrivacyCover = appState === 'inactive' || appState === 'background' || isLocked;

  const Container = Platform.OS === 'ios' ? FullWindowOverlay : Fragment;

  return showPrivacyCover ? (
    <Container>
      <GradientScreenView style={[styles.hideApp, { backgroundColor: colors.background }]}>
        <Image source={require('@/assets/images/astellr-logo.png')} style={styles.logo} resizeMode="contain" testID="LogoIcon" />
      </GradientScreenView>
    </Container>
  ) : null;
};

const styles = StyleSheet.create({
  hideApp: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
  },
});

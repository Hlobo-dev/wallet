/**
 * NubleAuthGate — renders children only when the user is authenticated.
 *
 * - While hydrating from Keychain: shows a branded splash spinner.
 * - When not authenticated: shows the PlatformLoginScreen.
 * - When authenticated: renders children (the full wallet app).
 *
 * Once signed in, the user is NEVER shown the login screen again
 * because NubleAuthProvider persists and auto-refreshes tokens.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useNubleAuth } from './NubleAuthProvider';
import { PlatformLoginScreen } from '@/screens/PlatformLogin';

export const NubleAuthGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { isReady, isAuthenticated } = useNubleAuth();

  // Still hydrating from Keychain — show branded splash
  if (!isReady) {
    return (
      <View style={styles.splash}>
        <Text style={styles.logo}>N</Text>
        <ActivityIndicator size="large" color="#7538F5" style={styles.spinner} />
      </View>
    );
  }

  // Not authenticated — show login/signup
  if (!isAuthenticated) {
    return <PlatformLoginScreen />;
  }

  // Authenticated — render the full wallet app
  return <>{children}</>;
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0D0D2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: '#7538F5',
  },
  spinner: {
    marginTop: 24,
  },
});

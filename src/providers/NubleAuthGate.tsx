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

import { BrandedSplash } from '@/components/BrandedSplash';

import { useNubleAuth } from './NubleAuthProvider';
import { PlatformLoginScreen } from '@/screens/PlatformLogin';

export const NubleAuthGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { isReady, isAuthenticated } = useNubleAuth();

  // Still hydrating from Keychain — show branded splash
  if (!isReady) {
    return <BrandedSplash />;
  }

  // Not authenticated — show login/signup
  if (!isAuthenticated) {
    return <PlatformLoginScreen />;
  }

  // Authenticated — render the full wallet app
  return <>{children}</>;
};

import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

import type { RouteProps } from '@/Routes';
import { Routes } from '@/Routes';

export const navigationRef = createNavigationContainerRef<RouteProps>();

export function resetToHome(options?: { showRecentActivity?: boolean }) {
  if (!navigationRef.isReady()) {
    return;
  }

  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: Routes.Home, params: options }],
    }),
  );
}

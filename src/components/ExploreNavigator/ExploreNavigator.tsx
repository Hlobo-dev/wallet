import type { FC } from 'react';

import { useNavigation } from '@react-navigation/native';

import { useCallback, useEffect, useState } from 'react';

import { ExploreTabBar } from '@/components/ExploreTabBar';
import { useGlobalState } from '@/components/GlobalState';

import { useCameraPermissionRequest } from '@/hooks/useCameraPermissionRequest';
import { Routes } from '@/Routes';
import { showPermissionDeniedAlert } from '@/utils/cameraPermissions';

import type { NavigationState } from '@react-navigation/native';

const getRouteFromState = (state: NavigationState | undefined): string => {
  const routes = state?.routes ?? [];
  return routes[routes.length - 1]?.name ?? '';
};

const ALLOWED_ROUTES = [Routes.Home, Routes.Explore, Routes.ExploreSubpage, Routes.Earn];

export const ExploreNavigator: FC = () => {
  const navigation = useNavigation();
  const [currentRoute, setCurrentRoute] = useState<string>(getRouteFromState(navigation.getState()));
  const [showNavTabs, setShowNavTabs] = useGlobalState('showNavTabs');
  const [canShowNav, setCanShowNav] = useState<boolean>(false);
  const [tabIndex, setTabIndex] = useState<number>(0);

  const { requestPermission } = useCameraPermissionRequest();

  const onScanPress = useCallback(async () => {
    const granted = await requestPermission();
    if (granted) {
      navigation.navigate(Routes.ConnectAppQRScan);
    } else {
      showPermissionDeniedAlert();
    }
  }, [requestPermission, navigation]);

  const onWalletPress = useCallback(() => {
    navigation.navigate(Routes.Home);
    setShowNavTabs(true);
  }, [navigation, setShowNavTabs]);

  const onExplorePress = useCallback(() => {
    navigation.navigate(Routes.Explore);
    setShowNavTabs(true);
  }, [navigation, setShowNavTabs]);

  const onChatPress = useCallback(() => {
    navigation.navigate(Routes.Chat);
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', event => {
      setCurrentRoute(getRouteFromState(event?.data?.state));
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const isAllowed = ALLOWED_ROUTES.map((s: string) => s).includes(currentRoute);
    setCanShowNav(isAllowed);
    setShowNavTabs(isAllowed);

    const routeToTabIndex: Record<string, number> = {
      [Routes.Home]: 0,
      [Routes.Explore]: 1,
      [Routes.ExploreSubpage]: 1,
      [Routes.Chat]: 2,
    };
    setTabIndex(routeToTabIndex[currentRoute] ?? 0);
  }, [currentRoute, setShowNavTabs]);

  return (
    <ExploreTabBar
      tabs={[
        { name: 'wallet', onPress: onWalletPress },
        { name: 'compass', onPress: onExplorePress },
        { name: 'comment', onPress: onChatPress },
        { name: 'scan-walletConnect', onPress: onScanPress },
      ]}
      activeTab={tabIndex}
      showTabs={showNavTabs && canShowNav}
    />
  );
};

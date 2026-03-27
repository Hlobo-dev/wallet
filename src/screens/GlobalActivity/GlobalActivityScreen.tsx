import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadingElement } from '@/components/FadingElement';
import { GradientScreenView } from '@/components/Gradients';
import { Label } from '@/components/Label';
import { AccountFilter } from '@/components/AccountFilter';
import { useAccountActivity } from '@/hooks/useAccountActivity';
import type { AccountActivityItem } from '@/hooks/useAccountActivity';
import { useHeaderTitle } from '@/hooks/useHeaderTitle';
import { refreshAllTransactions } from '@/realm/refreshManagerHooks';
import { useTransactionsFetch } from '@/realm/transactions';
import type { NavigationProps } from '@/Routes';
import { AccountActivityRow } from '@/screens/Home/components/AccountActivityRow';
import type { TransactionListItem } from '@/screens/Transactions/utils/useTransactionsDataSource';
import { useTransactionsDataSource } from '@/screens/Transactions/utils/useTransactionsDataSource';
import { navigationStyle } from '@/utils/navigationStyle';
import { useIsOnline } from '@/utils/useConnectionManager';

import { GlobalActivityEmptyAll, GlobalActivityEmptyNetworkSelection } from './components/GlobalActivityEmptyInfo';

import loc from '/loc';

// Union type for combined data source
type CombinedListItem =
  | { type: 'onchain'; data: TransactionListItem }
  | { type: 'accountActivity'; data: AccountActivityItem }
  | { type: 'sectionHeader'; label: string };

export const GlobalActivityScreen = ({ navigation }: NavigationProps<'GlobalActivity'>) => {
  useHeaderTitle(loc.globalActivity.title);

  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const { fetchAllTransactionsForAllNetworks } = useTransactionsFetch();
  const [isFetching, setIsFetching] = useState(false);
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashList<CombinedListItem>>(null);

  useEffect(() => {
    refreshAllTransactions();
  }, []);

  const onPendingTxSucceed = useCallback(() => {
    refreshAllTransactions();
  }, []);

  const { dataSource: onChainData, keyExtractor: onChainKeyExtractor, renderItem: onChainRenderItem, renderFooter, getItemType, loadNextPage } = useTransactionsDataSource({
    onPendingTxSucceed,
    navigation,
    networkFilter: [],
  });

  // Account activity (brokerage + wealth)
  const { activities: accountActivities, accountNames } = useAccountActivity();

  // Filter activities by selected account
  const filteredActivities = useMemo(() => {
    if (selectedAccount === null) {
      return accountActivities;
    }
    return accountActivities.filter(a => a.accountName === selectedAccount);
  }, [accountActivities, selectedAccount]);

  // Build combined data source
  const combinedData = useMemo<CombinedListItem[]>(() => {
    const items: CombinedListItem[] = [];

    // On-chain transactions section (only show when "All Accounts" is selected)
    if (selectedAccount === null && onChainData.length > 0) {
      items.push({ type: 'sectionHeader', label: 'Wallet Transactions' });
      for (const tx of onChainData) {
        items.push({ type: 'onchain', data: tx });
      }
    }

    // Account activity section (brokerage orders + wealth transactions)
    if (filteredActivities.length > 0) {
      items.push({ type: 'sectionHeader', label: selectedAccount ? selectedAccount : 'Account Activity' });
      for (const activity of filteredActivities) {
        items.push({ type: 'accountActivity', data: activity });
      }
    }

    return items;
  }, [onChainData, filteredActivities, selectedAccount]);

  const pullToRefresh = useCallback(async () => {
    if (isOnline) {
      setIsFetching(true);
      await fetchAllTransactionsForAllNetworks();
      setIsFetching(false);
    }
  }, [fetchAllTransactionsForAllNetworks, isOnline]);

  useEffect(() => {
    if (listRef.current && combinedData.length > 0) {
      listRef.current.scrollToIndex({
        animated: false,
        index: 0,
      });
    }
  }, [selectedAccount]);

  const combinedKeyExtractor = useCallback((item: CombinedListItem, index: number): string => {
    if (item.type === 'sectionHeader') {
      return `section_${item.label}_${index}`;
    }
    if (item.type === 'accountActivity') {
      return item.data.id;
    }
    return onChainKeyExtractor(item.data);
  }, [onChainKeyExtractor]);

  const combinedRenderItem = useCallback(({ item }: { item: CombinedListItem }) => {
    if (item.type === 'sectionHeader') {
      return (
        <Label type="boldTitle2" color="light50" style={styles.sectionHeader}>
          {item.label}
        </Label>
      );
    }
    if (item.type === 'accountActivity') {
      return <AccountActivityRow item={item.data} />;
    }
    return onChainRenderItem({ item: item.data });
  }, [onChainRenderItem]);

  const combinedGetItemType = useCallback((item: CombinedListItem): string => {
    if (item.type === 'sectionHeader') {
      return 'sectionHeader';
    }
    if (item.type === 'accountActivity') {
      return 'accountActivity';
    }
    return getItemType(item.data);
  }, [getItemType]);

  const renderEmptyState = () => {
    if (selectedAccount === null && combinedData.length === 0) {
      return <GlobalActivityEmptyAll navigation={navigation} />;
    }
    if (selectedAccount !== null && filteredActivities.length === 0) {
      return <GlobalActivityEmptyNetworkSelection />;
    }
    return null;
  };

  return (
    <GradientScreenView>
      <View style={styles.networkFilterContainer}>
        <AccountFilter
          accountNames={accountNames}
          selectedAccount={selectedAccount}
          onSelectAccount={setSelectedAccount}
        />
      </View>
      <FadingElement containerStyle={{ marginBottom: insets.bottom }}>
        {combinedData.length === 0 && renderEmptyState()}
        <FlashList
          ref={listRef}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={pullToRefresh} />}
          data={combinedData}
          renderItem={combinedRenderItem}
          getItemType={combinedGetItemType}
          estimatedItemSize={60}
          keyExtractor={combinedKeyExtractor}
          contentContainerStyle={styles.container}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
        />
      </FadingElement>
    </GradientScreenView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 150,
  },
  networkFilterContainer: {
    paddingVertical: 4,
    flexDirection: 'row',
    marginTop: 14,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
  },
});

GlobalActivityScreen.navigationOptions = navigationStyle({ title: loc.globalActivity.title, headerTransparent: true });

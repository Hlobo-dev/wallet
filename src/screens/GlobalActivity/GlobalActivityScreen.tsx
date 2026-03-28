import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadingElement } from '@/components/FadingElement';
import { GradientScreenView } from '@/components/Gradients';
import { Label } from '@/components/Label';
import { BrokerageAccountFilter } from '@/screens/Home/components/BrokerageAccountFilter';
import type { BrokerageAccount as FilterAccount } from '@/screens/Home/components/BrokerageAccountFilter';
import { useAccountActivity } from '@/hooks/useAccountActivity';
import type { AccountActivityItem } from '@/hooks/useAccountActivity';
import { useBrokeragePositions } from '@/hooks/useBrokeragePositions';
import { useWealthPositions } from '@/hooks/useWealthPositions';
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

  // Account activity (brokerage + wealth transactions)
  const { activities: accountActivities, isLoading: activityLoading, refetch: refetchActivity, debugMsg } = useAccountActivity();

  // Use positions to build filter pills (positions load reliably)
  const { holdings: brokerageHoldings } = useBrokeragePositions();
  const { holdings: wealthHoldings } = useWealthPositions();

  // Build account objects for the BrokerageAccountFilter pills from positions
  const filterAccounts = useMemo<FilterAccount[]>(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const h of brokerageHoldings) {
      const name = h.accountName;
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.value += h.value;
      } else {
        map.set(name, { count: 1, value: h.value });
      }
    }
    for (const h of wealthHoldings) {
      const name = h.institution;
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.value += h.currentValue;
      } else {
        map.set(name, { count: 1, value: h.currentValue });
      }
    }
    // Also add any account names from actual transactions that aren't in positions
    for (const a of accountActivities) {
      if (a.accountName && !map.has(a.accountName)) {
        map.set(a.accountName, { count: 1, value: 0 });
      }
    }
    return Array.from(map.entries())
      .map(([name, { count, value }]) => ({ name, positionCount: count, totalValue: value }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [brokerageHoldings, wealthHoldings, accountActivities]);

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

    // Brokerage + wealth real transactions only (no positions)
    if (filteredActivities.length > 0) {
      items.push({ type: 'sectionHeader', label: 'Recent Transactions' });
      for (const activity of filteredActivities) {
        items.push({ type: 'accountActivity', data: activity });
      }
    }

    return items;
  }, [onChainData, filteredActivities, selectedAccount]);

  const pullToRefresh = useCallback(async () => {
    if (isOnline) {
      setIsFetching(true);
      await Promise.all([
        fetchAllTransactionsForAllNetworks(),
        refetchActivity(),
      ]);
      setIsFetching(false);
    }
  }, [fetchAllTransactionsForAllNetworks, refetchActivity, isOnline]);

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
      <BrokerageAccountFilter
        accounts={filterAccounts}
        selectedAccount={selectedAccount}
        onSelectAccount={setSelectedAccount}
      />
      {/* Temporary debug banner — remove after verifying */}
      <View style={{ backgroundColor: '#1e293b', padding: 8, marginHorizontal: 16, borderRadius: 8, marginBottom: 4 }}>
        <Label type="regularCaption1" color="light75">
          {activityLoading
            ? `⏳ ${debugMsg}`
            : `✅ ${accountActivities.length} tx | ${combinedData.length} items | ${debugMsg}`}
        </Label>
      </View>
      <FadingElement containerStyle={{ marginBottom: insets.bottom }}>
        {combinedData.length === 0 && !activityLoading && renderEmptyState()}
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
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
  },
});

GlobalActivityScreen.navigationOptions = navigationStyle({ title: loc.globalActivity.title, headerTransparent: true });

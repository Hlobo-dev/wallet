import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { GradientItemBackground } from '@/components/GradientItemBackground';
import { Label } from '@/components/Label';
import { useAccountActivity } from '@/hooks/useAccountActivity';
import type { AccountActivityItem } from '@/hooks/useAccountActivity';
import { refreshAllTransactions } from '@/realm/refreshManagerHooks';
import { useTransactionMutations } from '@/realm/transactions';
import type { NavigationProps } from '@/Routes';
import { Routes } from '@/Routes';
import { useTransactionsDataSource } from '@/screens/Transactions/utils/useTransactionsDataSource';

import { AccountActivityRow } from './AccountActivityRow';

import loc from '/loc';

interface Props {
  navigation: NavigationProps<'Home'>['navigation'];
}

const TX_MAX_COUNT = 3;
const ACCOUNT_ACTIVITY_MAX = 5;
const COMBINED_MAX = 5;

export const RecentActivity = ({ navigation }: Props) => {
  const { dangerouslyCleanupConfirmedTransactions } = useTransactionMutations();
  const [canRenderSafeContent, setCanRenderSafeContent] = useState(false);

  useEffect(() => {
    (async () => {
      await dangerouslyCleanupConfirmedTransactions();
      setCanRenderSafeContent(true);
    })();
  }, [dangerouslyCleanupConfirmedTransactions]);

  const onAllActivityPress = () => {
    navigation.navigate(Routes.GlobalActivity);
  };

  const onPendingTxSucceed = useCallback(() => {
    refreshAllTransactions();
  }, []);

  const { dataSource, renderItem, keyExtractor } = useTransactionsDataSource({
    limit: TX_MAX_COUNT,
    navigation,
    skipTimeHeader: true,
    onPendingTxSucceed,
    isRecentActivityView: true,
  });

  // Fetch brokerage orders + wealth transactions
  const { activities: accountActivities } = useAccountActivity();
  const recentAccountActivities = accountActivities.slice(0, ACCOUNT_ACTIVITY_MAX);

  // Build a combined, time-sorted feed (on-chain + account activity)
  // On-chain txs don't have a simple timestamp, so we show them first,
  // then account activities below. Capped at COMBINED_MAX total items.
  const hasOnChainTx = dataSource.length > 0;
  const hasAccountActivity = recentAccountActivities.length > 0;
  const isEmpty = !hasOnChainTx && !hasAccountActivity;

  if (!canRenderSafeContent) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
      <Label type="boldTitle2" color="light50" style={styles.label}>
        {loc.globalActivity.recentActivity}
      </Label>
      {isEmpty ? (
        <View style={styles.emptyInfoContainer}>
          <GradientItemBackground backgroundType="modal" />
          <Image source={require('@/assets/images/transactions/zero_state_tx.png')} style={styles.image} />
          <View style={styles.emptyDescriptionContainer}>
            <Label type="boldTitle2" color="light100">
              {loc.globalActivity.transactionsWillAppearHere}
            </Label>
            <Label type="regularCaption1">{loc.globalActivity.addAssets}</Label>
          </View>
        </View>
      ) : (
        <View style={styles.sectionList}>
          <GradientItemBackground backgroundType="modal" key={`combined_${dataSource.length}_${recentAccountActivities.length}`} />

          {/* On-chain wallet transactions */}
          {dataSource.slice(0, COMBINED_MAX).map(item => (
            <View key={keyExtractor(item)}>{renderItem({ item })}</View>
          ))}

          {/* Brokerage orders + Wealth investment transactions */}
          {recentAccountActivities.slice(0, COMBINED_MAX - dataSource.length).map((item: AccountActivityItem) => (
            <AccountActivityRow key={item.id} item={item} />
          ))}
        </View>
      )}

      <View style={styles.pillContainer}>
        <Button
          textType="mediumBody"
          size="medium"
          onPress={onAllActivityPress}
          text={loc.globalActivity.allActivity}
          icon="clock"
          color="purple_40"
          style={styles.allActivityBtn}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 36,
    marginHorizontal: 12,
  },
  sectionList: {
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    gap: 6,
    paddingVertical: 6,
  },
  pillContainer: {
    marginTop: 12,
    alignItems: 'center',
    marginBottom: 120,
  },
  label: {
    marginLeft: 24,
  },
  image: {
    width: 64,
    height: 64,
  },
  emptyInfoContainer: {
    marginTop: 16,
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    overflow: 'hidden',
    borderRadius: 20,
  },
  emptyDescriptionContainer: {
    justifyContent: 'center',
    gap: 4,
    marginLeft: 8,
  },
  allActivityBtn: {
    paddingRight: 24,
    paddingLeft: 16,
    height: 40,
  },
});

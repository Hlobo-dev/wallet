import type { SectionListData, ViewToken } from 'react-native';

import { Fragment, useCallback, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomSheetRef } from '@/components/BottomSheet';
import { BottomSheet } from '@/components/BottomSheet';
import { DefiProtocolPositions } from '@/components/DefiProtocolPositions/DefiProtocolPositions';
import type { DefiProtocol } from '@/components/DefiProtocolPositions/DefiProtocolPositions.types';
import { FadingElement } from '@/components/FadingElement';

import { ListAnimatedItem } from '@/components/ListAnimatedItem';
import { ListHeader } from '@/components/ListHeader';
import { useBottomElementSpacing } from '@/hooks/useBottomElementSpacing';
import { useBrokeragePositions } from '@/hooks/useBrokeragePositions';
import type { BrokerageHolding } from '@/hooks/useBrokeragePositions';
import { useCommonSnapPoints } from '@/hooks/useCommonSnapPoints';
import { useWealthPositions } from '@/hooks/useWealthPositions';
import type { WealthHolding } from '@/hooks/useWealthPositions';
import { useDefiPositionsQuery } from '@/reactQuery/hooks/earn/useDefiPositionsQuery';
import type { RealmDefi } from '@/realm/defi';
import { useIsKrakenConnectCtaHidden } from '@/realm/krakenConnect/useIsKrakenConnectCtaHidden';
import { useTokenPrices } from '@/realm/tokenPrice';
import type { RealmToken } from '@/realm/tokens';
import { sortTokensByFiatValue, useTokensFilteredByReputationAndNetwork } from '@/realm/tokens';
import type { NavigationProps } from '@/Routes';
import { Routes } from '@/Routes';
import { isRealmObject } from '@/utils/isRealmObject';

import { HEADER_HEIGHT } from './consts';
import { DefiEmptyPositions } from './DefiEmptyPositions';
import { useHomeAssetPanelEmitterListener } from './homeAssetPanelEventEmitter';
import { HomeAssetPanelSectionList } from './HomeAssetsSectionList';
import { KrakenConnectFundCTA } from './KrakenConnectFundCTA';

import { BrokeragePositionRow } from './BrokeragePositionRow';
import { TokenRow } from './TokenRow';
import { WealthPositionRow } from './WealthPositionRow';

import loc from '/loc';

enum SectionName {
  Assets = 'Assets',
  BrokeragePositions = 'BrokeragePositions',
  WealthPositions = 'WealthPositions',
  Defi = 'Defi',
  DefiEarnNoPositions = 'DefiEarnNoPositions',
  DefiEarnPositions = 'DefiEarnPositions',
}

type Sections =
  | {
      key: typeof SectionName.Assets;
      index: number;
      data: RealmToken[];
    }
  | {
      key: typeof SectionName.BrokeragePositions;
      index: number;
      data: BrokerageHolding[];
    }
  | {
      key: typeof SectionName.WealthPositions;
      index: number;
      data: WealthHolding[];
    }
  | {
      key: typeof SectionName.DefiEarnPositions;
      index: number;
      data: DefiProtocol[];
    }
  | {
      key: typeof SectionName.DefiEarnNoPositions;
      index: number;
      data: DefiProtocol[];
    };

interface HomeAssetsPanelProps {
  navigation: NavigationProps<'Home'>['navigation'];
}

type SectionItem = RealmToken | RealmDefi | DefiProtocol | BrokerageHolding | WealthHolding;
type SectionType = SectionListData<SectionItem, Sections>;

const renderSectionSeparator = () => <View style={styles.headerDivider} />;

const renderItemSeparator = () => <View style={styles.divider} />;

const sectionListKeyExtractor = (item: SectionItem, index: number) => {
  if (item === null || (isRealmObject(item) && !item.isValid())) {
    return 'invalid_' + index;
  }
  // BrokerageHolding or WealthHolding items have a 'key' property starting with a known prefix
  if ('key' in item && typeof (item as BrokerageHolding).key === 'string') {
    const key = (item as BrokerageHolding).key;
    if (key.startsWith('brokerage_') || key.startsWith('wealth_')) {
      return key;
    }
  }
  return (item as RealmDefi).id || (item as RealmToken).assetId || `fallback_${index}`;
};

const isIos = Platform.OS === 'ios';

const DISTANCE_TO_RECENT_ACTIVITY = 300;

export const HomeAssetsPanel = ({ navigation }: HomeAssetsPanelProps) => {
  const tokens = useTokensFilteredByReputationAndNetwork([]);
  const tokenPrices = useTokenPrices();
  const { data: earnDefiPositions, isPending: isDefiPositionPending } = useDefiPositionsQuery();
  const { holdings: allBrokerageHoldings } = useBrokeragePositions();
  const { holdings: wealthHoldings } = useWealthPositions();
  const bottomSheetRef = useRef<BottomSheetRef>(null);
  const hideConnectCTA = useIsKrakenConnectCtaHidden();

  const stickyHeaderIndex = useSharedValue(0);

  // Split SnapTrade holdings: crypto → Brokerage section, stocks → Wealth section
  const brokerageHoldings = useMemo(
    () => allBrokerageHoldings.filter(h => h.isCrypto),
    [allBrokerageHoldings],
  );
  const brokerageStockHoldings = useMemo(
    () => allBrokerageHoldings.filter(h => !h.isCrypto),
    [allBrokerageHoldings],
  );

  // Combine stock positions from SnapTrade + holdings from Plaid into one Wealth list
  // Deduplicate by symbol — aggregate quantities across accounts
  const combinedWealthHoldings = useMemo(() => {
    const stocksAsWealth: WealthHolding[] = brokerageStockHoldings.map(h => ({
      key: `wealth_snap_${h.key}`,
      symbol: h.symbol,
      name: h.name,
      type: 'equity',
      price: h.price,
      costBasis: h.averageCost > 0 ? h.averageCost * h.units : null,
      quantity: h.units,
      currentValue: h.value,
      unrealizedPnl: h.unrealizedPnl,
      unrealizedPnlPercent: h.unrealizedPnlPercent,
      currency: 'USD',
      institution: h.accountName,
      itemId: h.accountId,
      bgColor: h.bgColor,
    }));

    const all = [...wealthHoldings, ...stocksAsWealth];

    // Deduplicate by symbol — keep the one with the highest value,
    // or aggregate if same symbol appears from multiple accounts
    const bySymbol = new Map<string, WealthHolding>();
    for (const h of all) {
      const existing = bySymbol.get(h.symbol);
      if (existing) {
        // Aggregate: sum quantities and values
        existing.quantity += h.quantity;
        existing.currentValue += h.currentValue;
        existing.unrealizedPnl = (existing.unrealizedPnl ?? 0) + (h.unrealizedPnl ?? 0);
        existing.costBasis = (existing.costBasis ?? 0) + (h.costBasis ?? 0);
        // Recalculate P&L percent from aggregated values
        if (existing.costBasis && existing.costBasis > 0) {
          existing.unrealizedPnlPercent = ((existing.currentValue - existing.costBasis) / existing.costBasis) * 100;
        }
      } else {
        bySymbol.set(h.symbol, { ...h });
      }
    }

    return Array.from(bySymbol.values()).sort((a, b) => b.currentValue - a.currentValue);
  }, [wealthHoldings, brokerageStockHoldings]);

  const tokensDataSource = useMemo(() => {
    return sortTokensByFiatValue(tokens.filtered('inGallery == "autoAdded" OR inGallery == "manuallyAdded"'), tokenPrices);
  }, [tokens, tokenPrices]);

  const sections = useMemo(() => {
    const items: SectionListData<SectionItem, Sections>[] = [];

    // If we have actual brokerage positions, show those under the Brokerage header
    // instead of the static wallet token list
    if (brokerageHoldings.length > 0) {
      items.push({ index: 0, key: SectionName.BrokeragePositions, data: brokerageHoldings });
    } else if (tokensDataSource && tokensDataSource?.length > 0) {
      // Fallback: show wallet tokens when no brokerage positions
      items.push({ index: 0, key: SectionName.Assets, data: tokensDataSource });
    }

    // Wealth section: stocks from SnapTrade + holdings from Plaid (Morgan Stanley, etc.)
    if (combinedWealthHoldings.length > 0) {
      items.push({ index: 1, key: SectionName.WealthPositions, data: combinedWealthHoldings });
    }

    if (!isDefiPositionPending) {
      const hasDefiPositions = earnDefiPositions && earnDefiPositions.length > 0;
      const section: SectionListData<SectionItem, Sections> = hasDefiPositions
        ? { index: 2, key: SectionName.DefiEarnPositions, data: earnDefiPositions }
        : { index: 2, key: SectionName.DefiEarnNoPositions, data: [] };

      items.push(section);
    }

    return items;
  }, [tokensDataSource, isDefiPositionPending, earnDefiPositions, brokerageHoldings, combinedWealthHoldings]);

  const renderTokenRow = useCallback(
    (item: RealmToken) => {
      if (!item.isValid()) {
        return null;
      }

      return (
        <ListAnimatedItem>
          <TokenRow token={item} navigation={navigation} />
        </ListAnimatedItem>
      );
    },
    [navigation],
  );

  const renderDefiEarnProtocol = useCallback((item: DefiProtocol) => {
    return (
      <ListAnimatedItem>
        <DefiProtocolPositions protocol={item} />
      </ListAnimatedItem>
    );
  }, []);

  const renderBrokeragePosition = useCallback((item: BrokerageHolding) => {
    return (
      <ListAnimatedItem>
        <BrokeragePositionRow holding={item} />
      </ListAnimatedItem>
    );
  }, []);

  const renderWealthPosition = useCallback((item: WealthHolding) => {
    return (
      <ListAnimatedItem>
        <WealthPositionRow holding={item} />
      </ListAnimatedItem>
    );
  }, []);

  const renderSectionItem = useCallback(
    ({ item, section }: { item: SectionItem; index: number; section: SectionType }) => {
      switch (section.key) {
        case SectionName.Assets:
          return renderTokenRow(item as RealmToken);
        case SectionName.BrokeragePositions:
          return renderBrokeragePosition(item as BrokerageHolding);
        case SectionName.WealthPositions:
          return renderWealthPosition(item as WealthHolding);
        case SectionName.DefiEarnPositions:
          return renderDefiEarnProtocol(item as DefiProtocol);
        default:
          return null;
      }
    },
    [renderTokenRow, renderBrokeragePosition, renderWealthPosition, renderDefiEarnProtocol],
  );

  const renderHeader = useCallback(
    ({ section, sticky }: { section: SectionType; sticky?: boolean }) => {
      const headerStyle = [styles.headerStyle, !sticky && styles.scrollableHeaderStyle];
      switch (section.key) {
        case SectionName.Assets:
        case SectionName.BrokeragePositions:
          return (
            <ListHeader
              title={loc.home.assets}
              buttonText={loc.home.manage}
              onButtonPress={() => {
                navigation.navigate(Routes.CoinsList);
              }}
              buttonTestID={`ManageCoinsButton${sticky ? '-Sticky' : ''}`}
              style={[headerStyle, !sticky && styles.firstHeader]}
            />
          );
        case SectionName.DefiEarnPositions:
          return <ListHeader title={loc.home.deposits} style={headerStyle} buttonTestID="DefiHeader" />;
        case SectionName.WealthPositions:
          return <ListHeader title={loc.home.deposits} style={headerStyle} buttonTestID="WealthHeader" />;
        case SectionName.DefiEarnNoPositions:
          return <DefiEmptyPositions />;
        default:
          return null;
      }
    },
    [navigation],
  );

  const stickyHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -stickyHeaderIndex.value * HEADER_HEIGHT }],
  }));

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: Array<ViewToken> }) => {
      const header = info.viewableItems.find(item => item.key === '0');
      if (header && stickyHeaderIndex.value !== header.item.index) {
        stickyHeaderIndex.value = header.item.index;
      }
    },
    [stickyHeaderIndex],
  );

  const defaultSnapPoints = useCommonSnapPoints('toHeaderAndMainContent');

  const { bottom } = useSafeAreaInsets();

  const minBottomSnapPoint = useMemo(() => {
    const higherScreenDistance = defaultSnapPoints.length > 0 ? defaultSnapPoints[0] - DISTANCE_TO_RECENT_ACTIVITY : 0;
    const smallerScreenDistance = (isIos ? 0 : bottom) + 64;
    return Math.max(higherScreenDistance, smallerScreenDistance);
  }, [bottom, defaultSnapPoints]);

  const snapPoints = useMemo(() => [minBottomSnapPoint, ...defaultSnapPoints], [defaultSnapPoints, minBottomSnapPoint]);

  const showKrakenConnectCTA = !hideConnectCTA;

  const paddingBottom = useBottomElementSpacing(showKrakenConnectCTA ? 240 : 80);

  const showRecentActivity = useCallback(() => {
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  useHomeAssetPanelEmitterListener(showRecentActivity);

  return (
    <BottomSheet noSafeInsetTop animateOnMount ref={bottomSheetRef} snapPoints={snapPoints} index={1} dismissible={false} noBackdrop>
      {showKrakenConnectCTA ? (
        <View style={styles.krakenConnectContainer}>
          <KrakenConnectFundCTA />
        </View>
      ) : null}
      <Animated.View style={styles.stickyHeaderContainer}>
        <Animated.View style={stickyHeaderStyle}>
          {sections.map(section => (
            <Fragment key={section.key}>{renderHeader({ section, sticky: true })}</Fragment>
          ))}
        </Animated.View>
      </Animated.View>
      <FadingElement>
        <HomeAssetPanelSectionList
          onViewableItemsChanged={onViewableItemsChanged}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustContentInsets
          renderItem={renderSectionItem}
          keyExtractor={sectionListKeyExtractor}
          renderSectionHeader={renderHeader}
          ItemSeparatorComponent={renderItemSeparator}
          SectionSeparatorComponent={renderSectionSeparator}
          sections={sections}
          contentContainerStyle={[styles.container, { paddingBottom }]}
          stickySectionHeadersEnabled={false}
        />
      </FadingElement>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginTop: -HEADER_HEIGHT - 8,
  },
  headerStyle: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  scrollableHeaderStyle: {
    marginTop: 28,
  },
  divider: {
    height: 6,
  },
  stickyHeaderContainer: {
    overflow: 'hidden',
    height: HEADER_HEIGHT,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  headerDivider: {
    height: 20,
  },
  leadingSectionDivider: {
    height: 48,
  },
  firstHeader: {
    marginTop: Platform.select({ ios: 28, default: 0 }),
    transform: [{ scale: 0 }],
  },
  krakenConnectContainer: {
    marginHorizontal: 24,
    marginVertical: 4,
  },
});

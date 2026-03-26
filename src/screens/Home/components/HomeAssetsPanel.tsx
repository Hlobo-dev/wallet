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

import { usePolygonPrices } from '@/hooks/usePolygonPrices';

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

  // ── Collect all unique symbols for Polygon.io real-time streaming ─────
  const allSymbols = useMemo(() => {
    const syms = new Set<string>();
    for (const h of allBrokerageHoldings) {
      if (h.symbol && !h.symbol.startsWith('CUR:')) {
        syms.add(h.symbol.toUpperCase());
      }
    }
    for (const h of wealthHoldings) {
      const ticker = h.tickerSymbol || h.symbol;
      if (ticker && ticker !== 'N/A') {
        syms.add(ticker.toUpperCase());
      }
    }
    return Array.from(syms);
  }, [allBrokerageHoldings, wealthHoldings]);

  // ── Polygon.io real-time prices (WebSocket + REST snapshot) ───────────
  const { prices: livePrices } = usePolygonPrices(allSymbols);

  const stickyHeaderIndex = useSharedValue(0);

  // Wealth section: only Plaid-connected holdings (Morgan Stanley, etc.)
  // Deduplicate by symbol — aggregate quantities across accounts
  // Compute wealth FIRST so we can exclude overlapping symbols from brokerage
  const combinedWealthHoldings = useMemo(() => {
    // Only Plaid holdings go to Wealth — no SnapTrade stock mixing
    const bySymbol = new Map<string, WealthHolding>();
    for (const h of wealthHoldings) {
      const existing = bySymbol.get(h.symbol);
      if (existing) {
        existing.quantity += h.quantity;
        existing.currentValue += h.currentValue;
        existing.unrealizedPnl = (existing.unrealizedPnl ?? 0) + (h.unrealizedPnl ?? 0);
        existing.costBasis = (existing.costBasis ?? 0) + (h.costBasis ?? 0);
        if (existing.costBasis && existing.costBasis > 0) {
          existing.unrealizedPnlPercent = ((existing.currentValue - existing.costBasis) / existing.costBasis) * 100;
        }
      } else {
        bySymbol.set(h.symbol, { ...h });
      }
    }
    return Array.from(bySymbol.values()).sort((a, b) => b.currentValue - a.currentValue);
  }, [wealthHoldings]);

  // All SnapTrade holdings go under Brokerage
  // Deduplicate by symbol — aggregate same symbol from multiple accounts
  // Exclude positions from wealth-type institutions (Morgan Stanley, etc.) that
  // may have leaked through SnapTrade — those belong in the Wealth/Plaid section.
  // We filter by accountName (institution), NOT by symbol, so that legitimate
  // Kraken / Robinhood positions sharing the same ticker are kept.
  const brokerageHoldings = useMemo(() => {
    const bySymbol = new Map<string, BrokerageHolding>();
    for (const h of allBrokerageHoldings) {
      // Skip positions from wealth institutions that shouldn't be in Brokerage.
      // These are already handled by the Plaid/wealth hook.
      const acctLower = (h.accountName || '').toLowerCase();
      if (
        acctLower.includes('morgan stanley') ||
        acctLower.includes('goldman sachs') ||
        acctLower.includes('merrill') ||
        acctLower.includes('jpmorgan') ||
        acctLower.includes('jp morgan') ||
        acctLower.includes('ubs') ||
        acctLower.includes('wells fargo') ||
        acctLower.includes('edward jones') ||
        acctLower.includes('charles schwab') ||
        acctLower.includes('fidelity') ||
        acctLower.includes('vanguard')
      ) {
        continue;
      }

      const existing = bySymbol.get(h.symbol);
      if (existing) {
        existing.units += h.units;
        existing.value += h.value;
        existing.unrealizedPnl += h.unrealizedPnl;
        const costBasis = existing.averageCost * (existing.units - h.units) + h.averageCost * h.units;
        existing.averageCost = existing.units > 0 ? costBasis / existing.units : 0;
        existing.unrealizedPnlPercent = existing.averageCost > 0
          ? ((existing.price - existing.averageCost) / existing.averageCost) * 100
          : 0;
      } else {
        bySymbol.set(h.symbol, { ...h });
      }
    }
    return Array.from(bySymbol.values()).sort((a, b) => b.value - a.value);
  }, [allBrokerageHoldings]);

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

    // Wealth section: holdings from Plaid (Morgan Stanley, etc.)
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
    const live = livePrices.get(item.symbol.toUpperCase());
    const handlePress = () => {
      navigation.navigate(Routes.BrokerageAsset, {
        symbol: item.symbol,
        name: item.name,
        price: live ? live.price : item.price,
        units: item.units,
        value: live ? item.units * live.price : item.value,
        averageCost: item.averageCost,
        unrealizedPnl: item.unrealizedPnl,
        unrealizedPnlPercent: item.unrealizedPnlPercent,
        change24h: live ? live.changePercent : item.change24h,
        isCrypto: item.isCrypto,
        bgColor: item.bgColor,
        accountName: item.accountName,
      });
    };
    return (
      <ListAnimatedItem>
        <BrokeragePositionRow holding={item} livePrice={live} onPress={handlePress} />
      </ListAnimatedItem>
    );
  }, [livePrices, navigation]);

  const renderWealthPosition = useCallback((item: WealthHolding) => {
    const ticker = (item.tickerSymbol || item.symbol).toUpperCase();
    const live = livePrices.get(ticker);
    const handlePress = () => {
      const costBasis = item.costBasis ?? 0;
      const effectivePrice = live ? live.price : item.price;
      const effectiveValue = item.quantity * effectivePrice;
      const pnl = costBasis > 0 ? effectiveValue - costBasis : (item.unrealizedPnl ?? 0);
      const pnlPct = costBasis > 0 ? ((effectiveValue - costBasis) / costBasis) * 100 : (item.unrealizedPnlPercent ?? 0);
      navigation.navigate(Routes.BrokerageAsset, {
        symbol: item.symbol,
        name: item.name,
        price: effectivePrice,
        units: item.quantity,
        value: effectiveValue,
        averageCost: costBasis > 0 && item.quantity > 0 ? costBasis / item.quantity : 0,
        unrealizedPnl: pnl,
        unrealizedPnlPercent: pnlPct,
        change24h: live ? live.changePercent : 0,
        isCrypto: false,
        bgColor: item.bgColor,
        accountName: item.institution,
        institution: item.institution,
      });
    };
    return (
      <ListAnimatedItem>
        <WealthPositionRow holding={item} livePrice={live} onPress={handlePress} />
      </ListAnimatedItem>
    );
  }, [livePrices, navigation]);

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
      // Determine which section is at the top of the visible area.
      // Viewable items are ordered top→bottom. The first item with a valid
      // section tells us which sticky header to show.
      for (const viewToken of info.viewableItems) {
        if (viewToken.section && typeof viewToken.section.index === 'number') {
          if (stickyHeaderIndex.value !== viewToken.section.index) {
            stickyHeaderIndex.value = viewToken.section.index;
          }
          return;
        }
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

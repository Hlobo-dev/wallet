/**
 * BrokerageAssetScreen — Full detail page for a brokerage/wealth position.
 *
 * Matches the existing Ethereum detail page style:
 *   • Header: icon + name + network/source
 *   • Balance section: fiat value + quantity
 *   • Price chart from Polygon.io aggregate bars
 *   • Period switcher (D / W / M / Y / All)
 *   • Market data cards (24h Volume, Market Cap, etc.)
 *
 * Navigated from BrokeragePositionRow / WealthPositionRow on the home screen.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient, vec } from '@shopify/react-native-skia';
import { CartesianChart, Line } from 'victory-native';
import Animated, { CurvedTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import type { SvgProps } from 'react-native-svg';

import { GradientScreenView } from '@/components/Gradients';
import { Label } from '@/components/Label';
import { PeriodSwitcher } from '@/components/PeriodSwitcher';
import { SvgIcon } from '@/components/SvgIcon';
import { Touchable } from '@/components/Touchable';
import { GradientItemBackground } from '@/components/GradientItemBackground';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';
import type { PriceHistoryPeriod } from '@/realm/tokenPrice';
import { useTheme } from '@/theme/themes';
import { navigationStyle } from '@/utils/navigationStyle';
import type { NavigationProps } from '@/Routes';

import { polygonRestClient } from '@/services/polygon/polygonRestClient';
import type { PriceBar, TickerDetails } from '@/services/polygon/polygonRestClient';
import { polygonWebSocket } from '@/services/polygon/polygonWebSocket';
import type { LivePrice } from '@/services/polygon/types';
import { getRemoteLogoUrls, isCurrencySymbol, parseCurrencyCode } from '@/hooks/useStockLogo';

import { icons } from '/generated/assetIcons';

// ─── Route params ───────────────────────────────────────────────────────────

export type BrokerageAssetRouteParams = {
  symbol: string;
  name: string;
  price: number;
  units: number;
  value: number;
  averageCost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  change24h: number;
  isCrypto: boolean;
  bgColor: string;
  accountName: string;
  /** Optional — present when navigating from wealth positions */
  institution?: string;
};

// ─── Logo resolution (same as BrokeragePositionRow) ─────────────────────────

const SYMBOL_TO_ICON_KEYS: Record<string, string[]> = {
  BTC: ['btc-hdsegwitbech32'],
  ETH: ['eth-ethereum'],
  SOL: ['sol-solana'],
  DOGE: ['doge-dogecoin'],
  AVAX: ['avax-avalanche'],
  LINK: ['link-ethereum'],
  UNI: ['uni-ethereum'],
  AAVE: ['aave-ethereum'],
  MATIC: ['matic-ethereum', 'matic-polygon'],
  POL: ['pol-polygon', 'pol-ethereum'],
  USDT: ['usdt-ethereum'],
  USDC: ['usdc-ethereum'],
};

function getBundledIcon(symbol: string): React.FC<SvgProps> | undefined {
  const upper = symbol.toUpperCase();
  const keys = SYMBOL_TO_ICON_KEYS[upper];
  if (keys) {
    for (const k of keys) {
      const icon = icons[k as keyof typeof icons];
      if (icon) {
        return icon;
      }
    }
  }
  const lower = symbol.toLowerCase();
  for (const suffix of ['ethereum', 'solana', 'polygon', 'hdsegwitbech32', 'dogecoin', 'avalanche', 'optimism', 'arbitrum', 'base']) {
    const icon = icons[`${lower}-${suffix}` as keyof typeof icons];
    if (icon) {
      return icon;
    }
  }
  return undefined;
}

// ─── Chart placeholder ──────────────────────────────────────────────────────

function generatePlaceholder(count: number): PriceBar[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    timestamp: now - (count - i) * 60000,
    value: 100,
  }));
}

const CHART_PLACEHOLDER = generatePlaceholder(100);

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatFiat(value: number, currencySymbol: string): string {
  if (value >= 1_000_000_000) {
    return `${currencySymbol}${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${currencySymbol}${(value / 1_000_000).toFixed(2)}M`;
  }
  return `${currencySymbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPrice(value: number, currencySymbol: string): string {
  if (value < 0.01 && value > 0) {
    return `${currencySymbol}${value.toFixed(6)}`;
  }
  return `${currencySymbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQuantity(units: number, symbol: string): string {
  if (units === 0) {
    return `0 ${symbol}`;
  }
  return `${units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}

function formatPnlPercent(pct: number): string {
  const prefix = pct >= 0 ? '+' : '';
  return `${prefix}${pct.toFixed(2)}%`;
}

// ─── Chart gradient colors ──────────────────────────────────────────────────

const GREEN_GRADIENT = ['#3D3D95', '#8D52FF', '#62DD93'];
const RED_GRADIENT = ['#8D52FF', '#8D52FF', '#EC6D6D'];

// ─── Icon size ──────────────────────────────────────────────────────────────

const HEADER_ICON_SIZE = 32;
const DETAIL_ICON_SIZE = 40;

// ─── Screen ─────────────────────────────────────────────────────────────────

export const BrokerageAssetScreen = ({ navigation, route }: NavigationProps<'BrokerageAsset'>) => {
  const params = route.params;
  const { currency } = useAppCurrency();
  const currencyInfo = getCurrencyInfo(currency);
  const sign = currencyInfo.sign;
  const { colors } = useTheme();

  // ── Live price from Polygon.io ──────────────────────────────────────────
  const [livePrice, setLivePrice] = useState<LivePrice | undefined>(
    polygonWebSocket.getPrice(params.symbol),
  );

  useEffect(() => {
    const unsub = polygonWebSocket.onPriceUpdate((prices) => {
      const p = prices.get(params.symbol.toUpperCase());
      if (p) {
        setLivePrice(p);
      }
    });
    return unsub;
  }, [params.symbol]);

  // ── Effective values (live or from params) ──────────────────────────────
  const effectivePrice = livePrice?.price ?? params.price;
  const effectiveValue = params.units * effectivePrice;
  const costBasis = params.units * params.averageCost;
  const effectivePnl = costBasis > 0 ? effectiveValue - costBasis : params.unrealizedPnl;
  const effectivePnlPct = costBasis > 0 ? (effectivePnl / costBasis) * 100 : params.unrealizedPnlPercent;
  const effectiveChange = livePrice?.changePercent ?? params.change24h;

  // ── Chart data ──────────────────────────────────────────────────────────
  const [chartData, setChartData] = useState<PriceBar[]>(CHART_PLACEHOLDER);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [period, setPeriod] = useState<PriceHistoryPeriod>('DAY');

  useEffect(() => {
    let cancelled = false;
    setChartLoaded(false);

    (async () => {
      const bars = await polygonRestClient.getAggregateBars(params.symbol, period);
      if (!cancelled && bars.length > 0) {
        setChartData(bars);
        setChartLoaded(true);
      } else if (!cancelled) {
        setChartLoaded(true); // Still mark loaded even if empty
      }
    })();

    return () => { cancelled = true; };
  }, [params.symbol, period]);

  // ── Ticker details (market cap, description, etc.) ──────────────────────
  const [details, setDetails] = useState<TickerDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await polygonRestClient.getTickerDetails(params.symbol);
      if (!cancelled) {
        setDetails(d);
      }
    })();
    return () => { cancelled = true; };
  }, [params.symbol]);

  // ── Chart computed values ───────────────────────────────────────────────
  const chartHigh = useMemo(() => {
    if (chartData.length === 0) { return 0; }
    return Math.max(...chartData.map(d => d.value));
  }, [chartData]);

  const chartLow = useMemo(() => {
    if (chartData.length === 0) { return 0; }
    return Math.min(...chartData.map(d => d.value));
  }, [chartData]);

  const priceChangeForChart = useMemo(() => {
    if (chartData.length < 2) { return 0; }
    const first = chartData[0].value;
    const last = chartData[chartData.length - 1].value;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [chartData]);

  const isPositive = priceChangeForChart >= 0;
  const chartColor = !chartLoaded
    ? [colors.purple_40, colors.purple_40]
    : isPositive
      ? GREEN_GRADIENT
      : RED_GRADIENT;

  // ── Header setup ────────────────────────────────────────────────────────
  const HeaderIcon = getBundledIcon(params.symbol);
  const headerLogoUrls = useMemo(() => getRemoteLogoUrls(params.symbol), [params.symbol]);
  const [headerUrlIdx, setHeaderUrlIdx] = useState(0);

  const headerTitleComponent = useCallback(() => {
    return (
      <View style={hdrStyles.container}>
        {HeaderIcon ? (
          <View style={hdrStyles.iconWrap}>
            <HeaderIcon width={HEADER_ICON_SIZE} height={HEADER_ICON_SIZE} />
          </View>
        ) : headerUrlIdx < headerLogoUrls.length ? (
          <View style={hdrStyles.iconWrap}>
            <Image
              source={{ uri: headerLogoUrls[headerUrlIdx] }}
              style={hdrStyles.remoteIcon}
              resizeMode="cover"
              onError={() => setHeaderUrlIdx(i => i + 1)}
            />
          </View>
        ) : (
          <View style={[hdrStyles.iconWrap, { backgroundColor: params.bgColor }]}>
            <Text style={hdrStyles.letter}>{params.symbol.charAt(0)}</Text>
          </View>
        )}
        <View>
          <Label type="boldTitle2" numberOfLines={1}>{params.name}</Label>
          <Label type="regularCaption1" color="light50">
            {params.institution || params.accountName}
          </Label>
        </View>
      </View>
    );
  }, [HeaderIcon, headerLogoUrls, headerUrlIdx, params]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: headerTitleComponent,
    });
  }, [headerTitleComponent, navigation]);

  // ── Period change handler ───────────────────────────────────────────────
  const onChangePeriod = useCallback((value: PriceHistoryPeriod) => {
    setPeriod(value);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  const pnlColor = effectivePnlPct >= 0 ? '#4ade80' : '#f87171';
  const changeColor = effectiveChange >= 0 ? '#4ade80' : '#f87171';
  const changePrefix = effectiveChange >= 0 ? '-' : '';

  return (
    <GradientScreenView>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Balance Section ──────────────────────────────────────────── */}
        <View style={styles.balanceSection}>
          <Label type="boldCaption2" color="light50" style={styles.balanceLabel}>
            BALANCE
          </Label>
          <Text style={styles.fiatValue}>
            {formatFiat(effectiveValue, sign)}
            <Text style={[styles.fiatCurrency]}> {currency}</Text>
          </Text>
          <Text style={styles.quantity}>
            {formatQuantity(params.units, params.symbol)}
          </Text>
        </View>

        {/* ── P&L Summary ──────────────────────────────────────────────── */}
        <View style={styles.pnlRow}>
          <View style={[styles.pnlBadge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={[styles.pnlText, { color: pnlColor }]}>
              P&L: {formatPnlPercent(effectivePnlPct)} ({effectivePnl >= 0 ? '+' : ''}{formatFiat(Math.abs(effectivePnl), sign)})
            </Text>
          </View>
          {effectiveChange !== 0 && (
            <View style={[styles.pnlBadge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
              <Text style={[styles.pnlText, { color: changeColor }]}>
                Today: {effectiveChange >= 0 ? '+' : ''}{effectiveChange.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>

        {/* ── Price Chart ──────────────────────────────────────────────── */}
        <View style={styles.chartSection}>
          <Label type="boldCaption2" color="light50" style={styles.priceLabel}>
            PRICE
          </Label>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>
              {formatPrice(effectivePrice, sign)}
            </Text>
            <Text style={[styles.priceChange, { color: changeColor }]}>
              {effectiveChange >= 0 ? '+' : ''}{effectiveChange.toFixed(1)}%
            </Text>
          </View>

          <Animated.View style={styles.chart} layout={CurvedTransition}>
            <CartesianChart data={chartData} xKey="timestamp" yKeys={['value']}>
              {({ points }) => (
                <Line
                  connectMissingData
                  curveType="natural"
                  points={points.value}
                  color={chartLoaded ? colors.kraken : colors.purple_40}
                  strokeWidth={3}
                  animate={{ type: 'timing', duration: 500 }}
                >
                  <LinearGradient start={vec(0, 0)} end={vec(400, 0)} colors={chartColor} />
                </Line>
              )}
            </CartesianChart>
          </Animated.View>

          <PeriodSwitcher onChange={onChangePeriod} />
        </View>

        {/* ── Market Data Cards ─────────────────────────────────────────── */}
        <View style={styles.marketDataRow}>
          <View style={[styles.marketCard, { backgroundColor: colors.dark15 }]}>
            <GradientItemBackground />
            <View style={styles.cardContent}>
              <MarketDataItem
                label="24h Volume"
                value={details?.marketCap ? formatFiat(details.marketCap * 0.02, sign) : '—'}
              />
              <MarketDataItem
                label="Market Cap"
                value={details?.marketCap ? formatFiat(details.marketCap, sign) : '—'}
              />
              {details?.totalEmployees ? (
                <MarketDataItem
                  label="Employees"
                  value={details.totalEmployees.toLocaleString()}
                />
              ) : null}
            </View>
          </View>

          <View style={[styles.marketCard, { backgroundColor: colors.dark15 }]}>
            <GradientItemBackground />
            <View style={styles.cardContent}>
              <MarketDataItem label="Day High" value={chartHigh > 0 ? formatPrice(chartHigh, sign) : '—'} />
              <MarketDataItem label="Day Low" value={chartLow > 0 ? formatPrice(chartLow, sign) : '—'} />
              <MarketDataItem
                label="Avg Cost"
                value={params.averageCost > 0 ? formatPrice(params.averageCost, sign) : '—'}
              />
            </View>
          </View>
        </View>

        {/* ── About Section ────────────────────────────────────────────── */}
        {details?.description ? (
          <View style={styles.aboutSection}>
            <Label type="boldTitle2" style={styles.aboutHeading}>
              About {params.name}
            </Label>
            <Label type="regularBody" color="light75" numberOfLines={6}>
              {details.description}
            </Label>
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </GradientScreenView>
  );
};

// ─── Market data item ───────────────────────────────────────────────────────

const MarketDataItem = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.mdItem}>
    <Label type="regularCaption1" color="light50">{label}</Label>
    <Label type="boldBody">{value}</Label>
  </View>
);

// ─── Navigation options ─────────────────────────────────────────────────────

BrokerageAssetScreen.navigationOptions = navigationStyle({
  headerTitleAlign: 'left',
  headerTransparent: true,
});

// ─── Header styles ──────────────────────────────────────────────────────────

const hdrStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: HEADER_ICON_SIZE / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  remoteIcon: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: HEADER_ICON_SIZE / 2,
  },
  letter: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

// ─── Main styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
  },
  // Balance
  balanceSection: {
    paddingTop: 24,
  },
  balanceLabel: {
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fiatValue: {
    color: '#B4A1FF',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  fiatCurrency: {
    fontSize: 16,
    fontWeight: '400',
    color: '#B4A1FF',
  },
  quantity: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: -4,
  },
  // P&L
  pnlRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  pnlBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pnlText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Chart
  chartSection: {
    marginTop: 32,
  },
  priceLabel: {
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  priceValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  priceChange: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  chart: {
    height: 140,
    marginLeft: -16,
    marginTop: 8,
  },
  // Market Data
  marketDataRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  marketCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
  },
  cardContent: {
    gap: 12,
  },
  mdItem: {
    gap: 2,
  },
  // About
  aboutSection: {
    marginTop: 28,
  },
  aboutHeading: {
    marginBottom: 12,
  },
  bottomSpacer: {
    height: 40,
  },
});

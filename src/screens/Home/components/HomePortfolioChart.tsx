/**
 * HomePortfolioChart — Replaces the Send/Receive/Swap action buttons on the
 * home screen with a portfolio-level price chart + period switcher.
 *
 * Uses the same visual style / gradient colours as the BrokerageAssetScreen
 * chart so it feels consistent across the app.
 *
 * How it works:
 *   1. Gathers all brokerage + wealth symbols held by the user.
 *   2. Fetches Polygon.io aggregate bars for each symbol for the selected period.
 *   3. Computes a weighted portfolio value at each timestamp to produce a single
 *      composite line chart.
 *   4. Falls back to a placeholder loading state if there are no holdings.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient, vec } from '@shopify/react-native-skia';
import { CartesianChart, Line } from 'victory-native';
import Animated, { CurvedTransition } from 'react-native-reanimated';

import { Label } from '@/components/Label';
import { PeriodSwitcher } from '@/components/PeriodSwitcher';
import { useBrokeragePositions } from '@/hooks/useBrokeragePositions';
import { useWealthPositions } from '@/hooks/useWealthPositions';
import type { PriceHistoryPeriod } from '@/realm/tokenPrice';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';
import { useTheme } from '@/theme/themes';

import { polygonRestClient } from '@/services/polygon/polygonRestClient';
import type { PriceBar } from '@/services/polygon/polygonRestClient';

// ─── Chart gradient colours (matching BrokerageAssetScreen) ─────────────────

const GREEN_GRADIENT = ['#3D3D95', '#8D52FF', '#62DD93'];
const RED_GRADIENT = ['#8D52FF', '#8D52FF', '#EC6D6D'];

// ─── Placeholder data ───────────────────────────────────────────────────────

function generatePlaceholder(count: number): PriceBar[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    timestamp: now - (count - i) * 60_000,
    value: 100,
  }));
}
const CHART_PLACEHOLDER = generatePlaceholder(80);

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatPrice(value: number, sign: string): string {
  if (value >= 1_000_000_000) {
    return `${sign}${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${sign}${(value / 1_000_000).toFixed(2)}M`;
  }
  return `${sign}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const HomePortfolioChart = () => {
  const { colors } = useTheme();
  const { currency } = useAppCurrency();
  const currencyInfo = getCurrencyInfo(currency);
  const sign = currencyInfo.sign;

  const { holdings: brokerageHoldings } = useBrokeragePositions();
  const { holdings: wealthHoldings } = useWealthPositions();

  // ── Gather all unique symbols + their weights (market value) ────────────
  const symbolWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of brokerageHoldings) {
      const sym = h.symbol.toUpperCase();
      map.set(sym, (map.get(sym) ?? 0) + h.value);
    }
    for (const h of wealthHoldings) {
      const sym = (h.tickerSymbol || h.symbol).toUpperCase();
      if (sym && sym !== 'N/A') {
        map.set(sym, (map.get(sym) ?? 0) + h.currentValue);
      }
    }
    return map;
  }, [brokerageHoldings, wealthHoldings]);

  const totalPortfolioValue = useMemo(() => {
    let total = 0;
    for (const v of symbolWeights.values()) {
      total += v;
    }
    return total;
  }, [symbolWeights]);

  // ── Chart state ─────────────────────────────────────────────────────────
  const [chartData, setChartData] = useState<PriceBar[]>(CHART_PLACEHOLDER);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [period, setPeriod] = useState<PriceHistoryPeriod>('DAY');

  // ── Fetch composite portfolio chart data ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const symbols = Array.from(symbolWeights.keys());
    if (symbols.length === 0) {
      setChartLoaded(true);
      return;
    }

    setChartLoaded(false);

    (async () => {
      try {
        // Fetch bars for each symbol in parallel (limit to top 10 by value)
        const topSymbols = symbols
          .sort((a, b) => (symbolWeights.get(b) ?? 0) - (symbolWeights.get(a) ?? 0))
          .slice(0, 10);

        const barResults = await Promise.all(
          topSymbols.map(async sym => {
            const bars = await polygonRestClient.getAggregateBars(sym, period);
            return { symbol: sym, bars };
          }),
        );

        if (cancelled) {
          return;
        }

        // Build composite portfolio line:
        // For each symbol, normalise price bars to a "weight factor" so that
        // the composite value = sum(weight_i * normalised_price_i).
        // weight_i = (market_value_i / total_portfolio_value)
        // normalised_price_i = price_at_t / price_at_first_bar

        const validResults = barResults.filter(r => r.bars.length >= 2);

        if (validResults.length === 0) {
          setChartLoaded(true);
          return;
        }

        // Use the result with the most data points as the time axis
        const maxBarsResult = validResults.reduce((a, b) => (a.bars.length >= b.bars.length ? a : b));
        const timeAxis = maxBarsResult.bars.map(b => b.timestamp);

        const composite: PriceBar[] = timeAxis.map((ts, idx) => {
          let portfolioValue = 0;

          for (const { symbol, bars } of validResults) {
            const weight = (symbolWeights.get(symbol) ?? 0) / (totalPortfolioValue || 1);
            const firstPrice = bars[0].value;
            // Pick the bar closest to this timestamp index (proportional)
            const barIdx = Math.min(Math.round((idx / timeAxis.length) * bars.length), bars.length - 1);
            const currentPrice = bars[barIdx].value;
            const normalised = firstPrice > 0 ? currentPrice / firstPrice : 1;
            portfolioValue += weight * normalised * totalPortfolioValue;
          }

          return { timestamp: ts, value: portfolioValue };
        });

        if (!cancelled && composite.length > 0) {
          setChartData(composite);
          setChartLoaded(true);
        }
      } catch (e) {
        console.warn('[HomePortfolioChart] Error building composite chart:', e);
        if (!cancelled) {
          setChartLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbolWeights, totalPortfolioValue, period]);

  // ── Derived values ──────────────────────────────────────────────────────
  const priceChange = useMemo(() => {
    if (chartData.length < 2) {
      return 0;
    }
    const first = chartData[0].value;
    const last = chartData[chartData.length - 1].value;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [chartData]);

  const isPositive = priceChange >= 0;
  const chartColor = !chartLoaded
    ? [colors.purple_40, colors.purple_40]
    : isPositive
      ? GREEN_GRADIENT
      : RED_GRADIENT;

  const changeColor = isPositive ? '#4ade80' : '#f87171';

  const onChangePeriod = useCallback((value: PriceHistoryPeriod) => {
    setPeriod(value);
  }, []);

  const hasHoldings = symbolWeights.size > 0;

  return (
    <View style={styles.container}>
      {/* PRICE label */}
      <Label type="boldCaption2" color="light50" style={styles.priceLabel}>
        PRICE
      </Label>

      {/* Price value + daily change % */}
      <View style={styles.priceRow}>
        <Text style={styles.priceValue}>
          {hasHoldings ? formatPrice(totalPortfolioValue, sign) : `${sign}0.00`}
        </Text>
        {chartLoaded && hasHoldings && (
          <Text style={[styles.priceChange, { color: changeColor }]}>
            {isPositive ? '+' : ''}{priceChange.toFixed(1)}%
          </Text>
        )}
      </View>

      {/* Chart */}
      <Animated.View style={styles.chart} layout={CurvedTransition}>
        <CartesianChart data={hasHoldings ? chartData : CHART_PLACEHOLDER} xKey="timestamp" yKeys={['value']}>
          {({ points }) => (
            <Line
              connectMissingData
              curveType="natural"
              points={points.value}
              color={chartLoaded && hasHoldings ? colors.kraken : colors.purple_40}
              strokeWidth={3}
              animate={{ type: 'timing', duration: 500 }}
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(400, 0)}
                colors={hasHoldings ? chartColor : [colors.purple_40, colors.purple_40]}
              />
            </Line>
          )}
        </CartesianChart>
      </Animated.View>

      {/* Period Switcher */}
      <PeriodSwitcher onChange={onChangePeriod} />
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 12,
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
});

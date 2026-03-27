/**
 * AccountActivityRow — Renders a brokerage or wealth holding in the
 * activity feed, matching the visual style of BrokeragePositionRow.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Label } from '@/components/Label';
import type { AccountActivityItem } from '@/hooks/useAccountActivity';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';

interface Props {
  item: AccountActivityItem;
}

function formatAmount(value: number, sign: string): string {
  if (value >= 1_000_000_000) {
    return `${sign}${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${sign}${(value / 1_000_000).toFixed(2)}M`;
  }
  return `${sign}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPnl(pnl: number, pnlPercent: number, sign: string): string {
  const prefix = pnl >= 0 ? '+' : '';
  return `${prefix}${pnlPercent.toFixed(2)}% (${sign}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}

export const AccountActivityRow = React.memo(({ item }: Props) => {
  const { currency } = useAppCurrency();
  const currencyInfo = getCurrencyInfo(currency);
  const sign = currencyInfo.sign;

  const pnlColor = item.pnl >= 0 ? '#4ade80' : '#f87171';

  // Initials for the fallback avatar (e.g. "AAPL" → "AA", "BTC" → "BT")
  const initials = item.symbol.substring(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      {/* Symbol avatar */}
      <View style={[styles.avatar, { backgroundColor: item.bgColor || 'rgba(255,255,255,0.08)' }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Title + subtitle */}
      <View style={styles.textContainer}>
        <Label type="boldBody" color="light100" numberOfLines={1}>
          {item.title}
        </Label>
        <Label type="regularCaption1" color="light50" numberOfLines={1}>
          {item.subtitle}
        </Label>
      </View>

      {/* Value + P&L */}
      <View style={styles.amountContainer}>
        <Label type="boldBody" color="light100">
          {formatAmount(item.amount, sign)}
        </Label>
        <Text style={[styles.pnlText, { color: pnlColor }]}>
          {formatPnl(item.pnl, item.pnlPercent, sign)}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  pnlText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

/**
 * AccountActivityRow — Renders either a real transaction (buy/sell/dividend)
 * or a current holding in the activity feed.
 *
 * Real transactions show: action badge (Buy/Sell) + symbol + date + amount
 * Holdings show: symbol avatar + name + P&L (same as before)
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
  const absVal = Math.abs(value);
  if (absVal >= 1_000_000_000) {
    return `${value < 0 ? '-' : ''}${sign}${(absVal / 1_000_000_000).toFixed(2)}B`;
  }
  if (absVal >= 1_000_000) {
    return `${value < 0 ? '-' : ''}${sign}${(absVal / 1_000_000).toFixed(2)}M`;
  }
  return `${value < 0 ? '-' : ''}${sign}${absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPnl(pnl: number, pnlPercent: number, sign: string): string {
  const prefix = pnl >= 0 ? '+' : '';
  return `${prefix}${pnlPercent.toFixed(2)}% (${sign}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Action → badge configuration
const ACTION_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  buy: { label: 'Buy', color: '#ffffff', bgColor: '#3b82f6' },
  sell: { label: 'Sell', color: '#ffffff', bgColor: '#ef4444' },
  dividend: { label: 'Div', color: '#ffffff', bgColor: '#22c55e' },
  fee: { label: 'Fee', color: '#ffffff', bgColor: '#f97316' },
  interest: { label: 'Int', color: '#ffffff', bgColor: '#06b6d4' },
  transfer: { label: 'Xfer', color: '#ffffff', bgColor: '#8b5cf6' },
  deposit: { label: 'Dep', color: '#ffffff', bgColor: '#22c55e' },
  withdrawal: { label: 'Wdl', color: '#ffffff', bgColor: '#ef4444' },
  other: { label: 'Txn', color: '#ffffff', bgColor: '#64748b' },
};

export const AccountActivityRow = React.memo(({ item }: Props) => {
  const { currency } = useAppCurrency();
  const currencyInfo = getCurrencyInfo(currency);
  const sign = currencyInfo.sign;

  // ── Real transaction rendering ────────────────────────────────────────
  if (item.isRealTransaction) {
    const config = ACTION_CONFIG[item.action] ?? ACTION_CONFIG.other;
    const amountColor = item.action === 'sell' || item.action === 'dividend' || item.action === 'interest'
      ? '#4ade80'  // cash in → green
      : item.action === 'buy'
        ? '#f87171'  // cash out → red
        : '#e2e8f0'; // neutral

    return (
      <View style={styles.container}>
        {/* Action badge */}
        <View style={[styles.actionBadge, { backgroundColor: config.bgColor }]}>
          <Text style={[styles.actionBadgeText, { color: config.color }]}>{config.label}</Text>
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

        {/* Amount + date */}
        <View style={styles.amountContainer}>
          <Text style={[styles.txAmount, { color: amountColor }]}>
            {formatAmount(item.amount, sign)}
          </Text>
          <Label type="regularCaption1" color="light50">
            {formatDate(item.date)}
          </Label>
        </View>
      </View>
    );
  }

  // ── Holding rendering (fallback / current positions) ──────────────────
  const pnlColor = item.pnl >= 0 ? '#4ade80' : '#f87171';
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
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  actionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  pnlText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

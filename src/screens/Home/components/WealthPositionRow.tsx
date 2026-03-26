/**
 * A row that renders a single wealth holding on the home screen.
 *
 * Wealth holdings come from Plaid-connected accounts (Morgan Stanley, etc.)
 * and are shown under the "Wealth" section header.
 *
 * Visual style matches BrokeragePositionRow — icon on left, name + P&L%,
 * fiat value + quantity on right. Uses institution brand colors for fallback icons.
 */
import React, { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { Label } from '@/components/Label';
import type { WealthHolding } from '@/hooks/useWealthPositions';
import { getRemoteLogoUrl } from '@/hooks/useStockLogo';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';

import { icons } from '/generated/assetIcons';

// ─── Logo resolution ──────────────────────────────────────────────────────────

/**
 * Map of symbol → network suffixes for bundled crypto icons.
 * Most wealth holdings are stocks/ETFs so they won't have bundled icons,
 * but we include a few in case crypto is held in a wealth account.
 */
const SYMBOL_TO_ICON_KEYS: Record<string, string[]> = {
  BTC: ['btc-hdsegwitbech32'],
  ETH: ['eth-ethereum'],
  SOL: ['sol-solana'],
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
  for (const suffix of ['ethereum', 'solana', 'polygon', 'hdsegwitbech32']) {
    const icon = icons[`${lower}-${suffix}` as keyof typeof icons];
    if (icon) {
      return icon;
    }
  }
  return undefined;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatFiat(value: number, currencySymbol: string): string {
  return `${currencySymbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQuantity(units: number, symbol: string): string {
  if (units === 0) {
    return `0.00 ${symbol}`;
  }
  return `${units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}

function formatPnlPercent(pct: number | null): string {
  if (pct === null) {
    return '';
  }
  const prefix = pct >= 0 ? '+' : '';
  return `${prefix}${pct.toFixed(2)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ICON_SIZE = 40;

const HoldingIcon = memo(({ symbol, bgColor }: { symbol: string; bgColor: string }) => {
  const Icon = getBundledIcon(symbol);
  const [remoteError, setRemoteError] = useState(false);

  // 1. Bundled SVG icon (crypto)
  if (Icon) {
    return (
      <View style={[iconStyles.ball, { backgroundColor: '#ffffff' }]}>
        <Icon width={ICON_SIZE} height={ICON_SIZE} style={iconStyles.svg} />
      </View>
    );
  }

  // 2. Remote logo from CDN (Parqet for stocks/ETFs, CoinCap for crypto)
  if (!remoteError) {
    const logoUri = getRemoteLogoUrl(symbol);
    return (
      <View style={[iconStyles.ball, iconStyles.remoteBall]}>
        <Image
          source={{ uri: logoUri }}
          style={iconStyles.remoteImage}
          resizeMode="cover"
          onError={() => setRemoteError(true)}
        />
      </View>
    );
  }

  // 3. Fallback: neutral semi-transparent circle with first 1-2 letters
  const letters = symbol.length <= 2 ? symbol : symbol.charAt(0);
  return (
    <View style={[iconStyles.ball, iconStyles.neutralBall]}>
      <Text style={iconStyles.letter}>{letters}</Text>
    </View>
  );
});

const iconStyles = StyleSheet.create({
  ball: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  neutralBall: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  remoteBall: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  svg: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  remoteImage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
  },
  letter: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface WealthPositionRowProps {
  holding: WealthHolding;
}

export const WealthPositionRow = memo(({ holding }: WealthPositionRowProps) => {
  const { currency } = useAppCurrency();
  const currencyInfo = useMemo(() => getCurrencyInfo(currency), [currency]);
  const sign = currencyInfo.sign;

  const pnlPctText = formatPnlPercent(holding.unrealizedPnlPercent);
  const isPositive = (holding.unrealizedPnlPercent ?? 0) >= 0;

  return (
    <View style={styles.container}>
      <HoldingIcon symbol={holding.symbol} bgColor={holding.bgColor} />

      {/* Left side: name + P&L */}
      <View style={styles.left}>
        <Label type="boldTitle2" numberOfLines={1}>
          {holding.name}
        </Label>
        {pnlPctText ? (
          <Text style={[styles.pnl, isPositive ? styles.pnlUp : styles.pnlDown]}>{pnlPctText}</Text>
        ) : (
          <Text style={styles.institution}>{holding.institution}</Text>
        )}
      </View>

      {/* Right side: value + quantity */}
      <View style={styles.right}>
        <Label type="boldTitle2">{formatFiat(holding.currentValue, sign)}</Label>
        <Label type="regularCaption1" color="light50">
          {formatQuantity(holding.quantity, holding.symbol)}
        </Label>
      </View>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  pnl: {
    fontSize: 13,
    fontWeight: '500',
  },
  pnlUp: {
    color: '#4ade80', // green400
  },
  pnlDown: {
    color: '#f87171', // red400
  },
  institution: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9ca3af', // gray400
  },
});

/**
 * A row that renders a single brokerage holding on the home screen.
 *
 * It re-uses the same visual pattern as `AssetRow` (icon on left, name + change,
 * fiat value + quantity on right) but sources data from the SnapTrade position
 * payload rather than Realm tokens.
 *
 * Logo resolution order (mirrors Vibe-Trading HoldingsCard):
 *   1. Bundled SVG icon from kraken-wallet-cryptoicons (getTokenIcon)
 *   2. Fallback: coloured circle with the first letter of the symbol
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { Label } from '@/components/Label';
import type { BrokerageHolding } from '@/hooks/useBrokeragePositions';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';

import { icons } from '/generated/assetIcons';

// ─── Logo resolution ──────────────────────────────────────────────────────────

/**
 * Map of symbol → network suffixes we try when looking up bundled icons.
 * For a symbol like "BTC" we try "btc-hdsegwitbech32", for "ETH" we try
 * "eth-ethereum", and so on.  This mirrors the keys in generated/assetIcons.ts.
 */
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
  DAI: ['dai-ethereum'],
  ARB: ['arb-arbitrum'],
  OP: ['op-optimism'],
  COMP: ['comp-ethereum'],
  MKR: ['mkr-ethereum'],
  CRV: ['crv-ethereum'],
  SNX: ['snx-ethereum'],
  GRT: ['grt-ethereum'],
  ENJ: ['enj-ethereum'],
  SHIB: ['shib-ethereum'],
  PEPE: ['pepe-ethereum'],
  IMX: ['imx-ethereum'],
  LDO: ['ldo-ethereum'],
  RNDR: ['rndr-ethereum'],
  GMX: ['gmx-arbitrum'],
  BONK: ['bonk-solana'],
  WBTC: ['wbtc-ethereum'],
  WETH: ['weth-ethereum'],
  PAXG: ['paxg-ethereum'],
  PYUSD: ['pyusd-ethereum'],
  ZRX: ['zrx-ethereum'],
  BLUR: ['blur-ethereum'],
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
  // Generic fallback: try `symbol-ethereum`, `symbol-solana`, etc.
  const lower = symbol.toLowerCase();
  for (const suffix of ['ethereum', 'solana', 'polygon', 'arbitrum', 'hdsegwitbech32', 'dogecoin', 'avalanche', 'optimism', 'base']) {
    const icon = icons[`${lower}-${suffix}` as keyof typeof icons];
    if (icon) {
      return icon;
    }
  }
  return undefined;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatFiat(value: number, currencySymbol: string): string {
  if (Math.abs(value) >= 1000) {
    return `${currencySymbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currencySymbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function formatQuantity(units: number, symbol: string): string {
  if (units === 0) {
    return `0 ${symbol}`;
  }
  if (units >= 1) {
    return `${units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${symbol}`;
  }
  return `${units.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 })} ${symbol}`;
}

function formatPnlPercent(pct: number): string {
  const prefix = pct >= 0 ? '+' : '';
  return `${prefix}${pct.toFixed(2)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ICON_SIZE = 40;

const HoldingIcon = memo(({ symbol, bgColor }: { symbol: string; bgColor: string }) => {
  const Icon = getBundledIcon(symbol);

  if (Icon) {
    return (
      <View style={[iconStyles.ball, { backgroundColor: '#ffffff' }]}>
        <Icon width={ICON_SIZE} height={ICON_SIZE} style={iconStyles.svg} />
      </View>
    );
  }

  // Fallback: neutral semi-transparent circle with first letter
  return (
    <View style={[iconStyles.ball, iconStyles.neutralBall]}>
      <Text style={iconStyles.letter}>{symbol.charAt(0)}</Text>
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
  svg: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  letter: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    fontSize: 16,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface BrokeragePositionRowProps {
  holding: BrokerageHolding;
}

export const BrokeragePositionRow: React.FC<BrokeragePositionRowProps> = memo(({ holding }) => {
  const { currency } = useAppCurrency();
  const currencyInfo = getCurrencyInfo(currency);
  const currencySymbol = currencyInfo.sign;

  const pnlColor = holding.unrealizedPnlPercent >= 0 ? 'green400' : 'red400';
  const pnlLabel = formatPnlPercent(holding.unrealizedPnlPercent);
  const fiatValue = formatFiat(holding.value, currencySymbol);
  const qty = formatQuantity(holding.units, holding.symbol);

  const row = useMemo(
    () => (
      <View style={styles.container}>
        {/* Left: icon + name + change */}
        <View style={styles.leftContentContainer}>
          <HoldingIcon symbol={holding.symbol} bgColor={holding.bgColor} />
          <View style={styles.labelContainer}>
            <Label type="boldTitle2" numberOfLines={1} style={styles.nameLabel}>
              {holding.name}
            </Label>
            <Label type="regularCaption1" color={pnlColor}>
              {pnlLabel}
            </Label>
          </View>
        </View>

        {/* Right: fiat value + quantity */}
        <View style={styles.rightContentContainer}>
          <Label type="boldMonospace" style={styles.fiatLabel}>
            {fiatValue}
          </Label>
          <Label type="regularMonospace" color="light50" style={styles.qtyLabel} numberOfLines={1}>
            {qty}
          </Label>
        </View>
      </View>
    ),
    [holding.symbol, holding.bgColor, holding.name, pnlColor, pnlLabel, fiatValue, qty],
  );

  return row;
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    minHeight: 52,
  },
  leftContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 12,
  },
  labelContainer: {
    flexShrink: 1,
  },
  nameLabel: {
    flexShrink: 1,
  },
  rightContentContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  fiatLabel: {
    fontSize: 15,
  },
  qtyLabel: {
    fontSize: 13,
  },
});

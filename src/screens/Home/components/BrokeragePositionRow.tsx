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
import React, { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { Label } from '@/components/Label';
import { Touchable } from '@/components/Touchable';
import type { BrokerageHolding } from '@/hooks/useBrokeragePositions';
import { getRemoteLogoUrls, isCurrencySymbol, parseCurrencyCode } from '@/hooks/useStockLogo';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';
import type { LivePrice } from '@/services/polygon/types';

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

// ─── Currency display helpers ─────────────────────────────────────────────────

/** Pretty names for cash / fiat positions (industry standard). */
const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen',
  CHF: 'Swiss Franc', CAD: 'Canadian Dollar', AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar', HKD: 'Hong Kong Dollar', SGD: 'Singapore Dollar',
  KRW: 'Korean Won', CNY: 'Chinese Yuan', CNH: 'Chinese Yuan (Offshore)',
  INR: 'Indian Rupee', MXN: 'Mexican Peso', BRL: 'Brazilian Real',
  SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone',
  PLN: 'Polish Zloty', ZAR: 'South African Rand', TRY: 'Turkish Lira',
  THB: 'Thai Baht', TWD: 'Taiwan Dollar', ILS: 'Israeli Shekel',
  AED: 'UAE Dirham', SAR: 'Saudi Riyal', RUB: 'Russian Ruble',
  CZK: 'Czech Koruna', HUF: 'Hungarian Forint', RON: 'Romanian Leu',
  CLP: 'Chilean Peso', COP: 'Colombian Peso', PEN: 'Peruvian Sol',
  ARS: 'Argentine Peso', PHP: 'Philippine Peso', IDR: 'Indonesian Rupiah',
  MYR: 'Malaysian Ringgit', VND: 'Vietnamese Dong', EGP: 'Egyptian Pound',
  NGN: 'Nigerian Naira', KES: 'Kenyan Shilling', GHS: 'Ghanaian Cedi',
  UAH: 'Ukrainian Hryvnia',
};

/** Clean display name for a holding — resolves ugly "U S Dollar" / "CUR:USD" to "US Dollar". */
function getDisplayName(name: string, symbol: string): string {
  if (isCurrencySymbol(symbol)) {
    const code = parseCurrencyCode(symbol);
    return CURRENCY_NAMES[code] ?? name;
  }
  return name;
}

/** Clean display symbol — "CUR:USD" → "USD". */
function getDisplaySymbol(symbol: string): string {
  if (isCurrencySymbol(symbol)) {
    return parseCurrencyCode(symbol);
  }
  return symbol;
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

function formatPnlPercent(pct: number): string {
  const prefix = pct >= 0 ? '+' : '';
  return `${prefix}${pct.toFixed(2)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ICON_SIZE = 40;

const HoldingIcon = memo(({ symbol, bgColor }: { symbol: string; bgColor: string }) => {
  const Icon = getBundledIcon(symbol);
  const logoUrls = useMemo(() => getRemoteLogoUrls(symbol), [symbol]);
  const [urlIndex, setUrlIndex] = useState(0);

  // 1. Bundled SVG icon (crypto)
  if (Icon) {
    return (
      <View style={[iconStyles.ball, { backgroundColor: '#ffffff' }]}>
        <Icon width={ICON_SIZE} height={ICON_SIZE} style={iconStyles.svg} />
      </View>
    );
  }

  // 2. Multi-CDN waterfall (Public → Parqet → FMP, or CoinCap / flag)
  if (urlIndex < logoUrls.length) {
    return (
      <View style={[iconStyles.ball, iconStyles.remoteBall]}>
        <Image
          source={{ uri: logoUrls[urlIndex] }}
          style={iconStyles.remoteImage}
          resizeMode="cover"
          onError={() => setUrlIndex(prev => prev + 1)}
        />
      </View>
    );
  }

  // 3. Fallback: neutral semi-transparent circle with first letter
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
    fontWeight: '600',
    fontSize: 16,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface BrokeragePositionRowProps {
  holding: BrokerageHolding;
  /** Real-time price from Polygon.io WebSocket (optional — overlays SnapTrade price). */
  livePrice?: LivePrice;
  /** Called when the user taps the row. */
  onPress?: () => void;
}

export const BrokeragePositionRow: React.FC<BrokeragePositionRowProps> = memo(({ holding, livePrice, onPress }) => {
  const { currency } = useAppCurrency();
  const currencyInfo = getCurrencyInfo(currency);
  const currencySymbol = currencyInfo.sign;

  // ── Overlay live Polygon price if available ─────────────────────────────
  const effectivePrice = livePrice ? livePrice.price : holding.price;
  const effectiveValue = holding.units * effectivePrice;
  const costBasis = holding.units * holding.averageCost;
  const effectivePnl = costBasis > 0 ? effectiveValue - costBasis : holding.unrealizedPnl;
  const effectivePnlPct = costBasis > 0 ? (effectivePnl / costBasis) * 100 : holding.unrealizedPnlPercent;

  // Use Polygon's 24h change if available
  const effectiveChange24h = livePrice ? livePrice.changePercent : holding.change24h;

  const displayName = getDisplayName(holding.name, holding.symbol);
  const displaySymbol = getDisplaySymbol(holding.symbol);
  const pnlColor = effectivePnlPct >= 0 ? 'green400' : 'red400';
  const pnlLabel = formatPnlPercent(effectivePnlPct);

  // Show 24h change next to P&L if we have real data from Polygon
  const changeLabel = effectiveChange24h !== 0
    ? ` (${effectiveChange24h >= 0 ? '+' : ''}${effectiveChange24h.toFixed(2)}% today)`
    : '';

  const fiatValue = formatFiat(effectiveValue, currencySymbol);
  const qty = formatQuantity(holding.units, displaySymbol);

  const row = useMemo(
    () => (
      <Touchable onPress={onPress} disabled={!onPress}>
        <View style={styles.container}>
          {/* Left: icon + name + change */}
          <View style={styles.leftContentContainer}>
            <HoldingIcon symbol={holding.symbol} bgColor={holding.bgColor} />
            <View style={styles.labelContainer}>
              <Label type="boldTitle2" numberOfLines={1} style={styles.nameLabel}>
                {displayName}
              </Label>
              <Label type="regularCaption1" color={pnlColor}>
                {pnlLabel}{changeLabel}
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
      </Touchable>
    ),
    [holding.symbol, holding.bgColor, displayName, pnlColor, pnlLabel, changeLabel, fiatValue, qty, onPress],
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

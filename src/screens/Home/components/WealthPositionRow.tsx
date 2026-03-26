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
import { Touchable } from '@/components/Touchable';
import type { WealthHolding } from '@/hooks/useWealthPositions';
import { getRemoteLogoUrls, isCurrencySymbol, parseCurrencyCode } from '@/hooks/useStockLogo';
import { useAppCurrency } from '@/realm/settings/useAppCurrency';
import { getCurrencyInfo } from '@/screens/Settings/currency';
import type { LivePrice } from '@/services/polygon/types';

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
  /** Real-time price from Polygon.io WebSocket (optional — overlays Plaid price). */
  livePrice?: LivePrice;
  /** Called when the user taps the row. */
  onPress?: () => void;
}

export const WealthPositionRow = memo(({ holding, livePrice, onPress }: WealthPositionRowProps) => {
  const { currency } = useAppCurrency();
  const currencyInfo = useMemo(() => getCurrencyInfo(currency), [currency]);
  const sign = currencyInfo.sign;

  // ── Overlay live Polygon price if available ─────────────────────────────
  const effectivePrice = livePrice ? livePrice.price : holding.price;
  const effectiveValue = holding.quantity * effectivePrice;
  const costBasis = holding.costBasis ?? 0;
  const effectivePnl = costBasis > 0 ? effectiveValue - costBasis : holding.unrealizedPnl;
  const effectivePnlPct = costBasis > 0 ? ((effectiveValue - costBasis) / costBasis) * 100 : holding.unrealizedPnlPercent;

  // Use Polygon's 24h change if available
  const change24h = livePrice ? livePrice.changePercent : 0;

  const displayName = getDisplayName(holding.name, holding.symbol);
  const displaySymbol = getDisplaySymbol(holding.symbol);
  const pnlPctText = formatPnlPercent(effectivePnlPct);
  const isPositive = (effectivePnlPct ?? 0) >= 0;

  // Show 24h change next to P&L if we have real data from Polygon
  const changeLabel = change24h !== 0
    ? ` (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% today)`
    : '';

  return (
    <Touchable onPress={onPress} disabled={!onPress}>
      <View style={styles.container}>
        <HoldingIcon symbol={holding.symbol} bgColor={holding.bgColor} />

        {/* Left side: name + P&L */}
        <View style={styles.left}>
          <Label type="boldTitle2" numberOfLines={1}>
            {displayName}
          </Label>
          {pnlPctText ? (
            <Text style={[styles.pnl, isPositive ? styles.pnlUp : styles.pnlDown]}>{pnlPctText}{changeLabel}</Text>
          ) : (
            <Text style={styles.institution}>{holding.institution}</Text>
          )}
        </View>

        {/* Right side: value + quantity */}
        <View style={styles.right}>
          <Label type="boldTitle2">{formatFiat(effectiveValue, sign)}</Label>
          <Label type="regularCaption1" color="light50">
            {formatQuantity(holding.quantity, displaySymbol)}
          </Label>
        </View>
      </View>
    </Touchable>
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

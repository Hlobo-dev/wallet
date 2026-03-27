/**
 * Horizontal pill strip for filtering brokerage positions by account.
 *
 * Shows an "All" pill followed by one pill per connected brokerage account.
 * Each pill displays the institution logo (from the stock logo CDN) and name.
 * Tapping a pill filters the brokerage positions list to that account.
 */
import React, { memo, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KrakenIcon } from '@/components/KrakenIcon';
import { Label } from '@/components/Label';
import { Touchable } from '@/components/Touchable';
import { getRemoteLogoUrls } from '@/hooks/useStockLogo';

// ─── Institution logo mapping ─────────────────────────────────────────────────

/** Well-known brokerage → ticker symbol for logo resolution. */
const INSTITUTION_LOGO_TICKERS: Record<string, string> = {
  robinhood: 'HOOD',
  kraken: 'KRAK',
  'charles schwab': 'SCHW',
  schwab: 'SCHW',
  fidelity: 'FIS',
  'interactive brokers': 'IBKR',
  'td ameritrade': 'AMTD',
  etrade: 'ETFC',
  'e*trade': 'ETFC',
  webull: 'WEBULL',
  coinbase: 'COIN',
  sofi: 'SOFI',
  public: 'PUBLIC',
  tastytrade: 'TASTY',
  ally: 'ALLY',
  firstrade: 'FIRST',
  moomoo: 'FUTU',
  // Wealth institutions
  'morgan stanley': 'MS',
  'goldman sachs': 'GS',
  'jp morgan': 'JPM',
  jpmorgan: 'JPM',
  merrill: 'BAC',
  'merrill lynch': 'BAC',
  ubs: 'UBS',
  'wells fargo': 'WFC',
  'edward jones': 'EDJ',
  vanguard: 'VGD',
};

/** Institution brand colors for fallback circles. */
const INSTITUTION_COLORS: Record<string, string> = {
  robinhood: '#00C805',
  kraken: '#5741D9',
  'charles schwab': '#00A0DF',
  schwab: '#00A0DF',
  fidelity: '#4B8B3B',
  'interactive brokers': '#E42217',
  coinbase: '#0052FF',
  sofi: '#00D4AA',
  webull: '#F5A623',
  'td ameritrade': '#2B8C2C',
  etrade: '#6633CC',
  'e*trade': '#6633CC',
  public: '#000000',
  ally: '#5A2D82',
  moomoo: '#FF6600',
  // Wealth institutions
  'morgan stanley': '#002B59',
  'goldman sachs': '#6F9FD8',
  'jp morgan': '#005EB8',
  jpmorgan: '#005EB8',
  merrill: '#012169',
  'merrill lynch': '#012169',
  ubs: '#E60000',
  'wells fargo': '#D71E28',
  'edward jones': '#006747',
  vanguard: '#96252D',
};

function getInstitutionColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(INSTITUTION_COLORS)) {
    if (lower.includes(key)) {
      return color;
    }
  }
  // Fallback: hash-based color
  const FALLBACKS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444'];
  const idx = name.charCodeAt(0) % FALLBACKS.length;
  return FALLBACKS[idx];
}

function getLogoTicker(name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, ticker] of Object.entries(INSTITUTION_LOGO_TICKERS)) {
    if (lower.includes(key)) {
      return ticker;
    }
  }
  return undefined;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrokerageAccount {
  /** Account name / institution name, e.g. "Robinhood" */
  name: string;
  /** Number of positions in this account */
  positionCount: number;
  /** Total value across positions */
  totalValue: number;
}

interface BrokerageAccountFilterProps {
  accounts: BrokerageAccount[];
  selectedAccount: string | null; // null = "All"
  onSelectAccount: (accountName: string | null) => void;
}

// ─── Pill Components ────────────────────────────────────────────────────────

const PILL_ICON_SIZE = 20;

const InstitutionLogo = memo(({ name }: { name: string }) => {
  const isKraken = name.toLowerCase().includes('kraken');
  const ticker = getLogoTicker(name);
  const logoUrls = useMemo(() => (ticker ? getRemoteLogoUrls(ticker) : []), [ticker]);
  const [urlIndex, setUrlIndex] = useState(0);

  // Use the bundled Kraken icon for Kraken accounts
  if (isKraken) {
    return <KrakenIcon size={PILL_ICON_SIZE} iconSize={12} />;
  }

  if (ticker && urlIndex < logoUrls.length) {
    return (
      <View style={pillStyles.logoContainer}>
        <Image
          source={{ uri: logoUrls[urlIndex] }}
          style={pillStyles.logoImage}
          resizeMode="cover"
          onError={() => setUrlIndex(prev => prev + 1)}
        />
      </View>
    );
  }

  // Fallback: colored circle with initial
  const color = getInstitutionColor(name);
  return (
    <View style={[pillStyles.logoContainer, { backgroundColor: color }]}>
      <Text style={pillStyles.logoLetter}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
});

const pillStyles = StyleSheet.create({
  logoContainer: {
    width: PILL_ICON_SIZE,
    height: PILL_ICON_SIZE,
    borderRadius: PILL_ICON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  logoImage: {
    width: PILL_ICON_SIZE,
    height: PILL_ICON_SIZE,
    borderRadius: PILL_ICON_SIZE / 2,
  },
  logoLetter: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export const BrokerageAccountFilter = memo(({ accounts, selectedAccount, onSelectAccount }: BrokerageAccountFilterProps) => {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* "All" pill */}
        <Touchable onPress={() => onSelectAccount(null)}>
          <View style={[styles.pill, selectedAccount === null && styles.pillSelected]}>
            <Label
              type="boldCaption1"
              color={selectedAccount === null ? 'light100' : 'light50'}
              numberOfLines={1}
            >
              All
            </Label>
          </View>
        </Touchable>

        {/* One pill per account */}
        {accounts.map(account => {
          const isSelected = selectedAccount === account.name;
          return (
            <Touchable key={account.name} onPress={() => onSelectAccount(account.name)}>
              <View style={[styles.pill, isSelected && styles.pillSelected]}>
                <InstitutionLogo name={account.name} />
                <Label
                  type="boldCaption1"
                  color={isSelected ? 'light100' : 'light50'}
                  numberOfLines={1}
                >
                  {account.name}
                </Label>
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
});

// ─── Inline Header Pill ─────────────────────────────────────────────────────

/**
 * Compact pill that sits in the ListHeader right side.
 * Tapping cycles through: All → Account1 → Account2 → ... → All
 */
export const AccountSelectorPill = memo(({ accounts, selectedAccount, onSelectAccount }: BrokerageAccountFilterProps) => {
  if (accounts.length === 0) {
    return null;
  }

  const handlePress = () => {
    if (selectedAccount === null) {
      // Currently "All" → go to first account
      onSelectAccount(accounts[0].name);
    } else {
      const currentIdx = accounts.findIndex(a => a.name === selectedAccount);
      if (currentIdx < accounts.length - 1) {
        // Go to next account
        onSelectAccount(accounts[currentIdx + 1].name);
      } else {
        // Last account → back to "All"
        onSelectAccount(null);
      }
    }
  };

  const displayName = selectedAccount ?? 'All';

  return (
    <Touchable onPress={handlePress}>
      <View style={selectorStyles.pill}>
        {selectedAccount && <InstitutionLogo name={selectedAccount} />}
        <Label type="boldCaption1" color="light100" numberOfLines={1}>
          {displayName}
        </Label>
        <Label type="boldCaption1" color="light50">
          ▾
        </Label>
      </View>
    </Touchable>
  );
});

const selectorStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    marginTop: 8,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 24,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pillSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
});

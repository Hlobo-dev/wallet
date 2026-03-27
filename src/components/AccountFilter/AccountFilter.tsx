/**
 * AccountFilter — Horizontal scrollable pill bar for filtering activity by
 * connected account. Shows "All Accounts" pill plus one pill per unique
 * institution/brokerage found in the activity items.
 *
 * Visual style matches the existing NetworkFilter so it feels native.
 */
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { Label } from '@/components/Label';
import { Pill } from '@/components/Pill';
import { Touchable } from '@/components/Touchable';

// ─── Brand colours for well-known institutions ──────────────────────────────

const INSTITUTION_COLORS: Record<string, string> = {
  robinhood: '#00c805',
  kraken: '#5741d9',
  'morgan stanley': '#003986',
  'morgan stanley client services': '#003986',
  'morgan stanley client serv': '#003986',
  fidelity: '#4e8b3b',
  'charles schwab': '#00a3e0',
  schwab: '#00a3e0',
  vanguard: '#c41230',
  'td ameritrade': '#3db03d',
  'e*trade': '#6633cc',
  etrade: '#6633cc',
  webull: '#f56c2d',
  'interactive brokers': '#d81b34',
  coinbase: '#0052ff',
  gemini: '#00dcfa',
  'goldman sachs': '#7399c6',
  'jp morgan': '#0a2d6b',
  'wells fargo': '#d71e28',
  wealthfront: '#472dbe',
  betterment: '#1d8cf8',
};

function getInstitutionColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(INSTITUTION_COLORS)) {
    if (lower.includes(key)) {
      return color;
    }
  }
  // Default accent
  return '#8D52FF';
}

/**
 * Shorten long institution names so the pill fits nicely.
 * e.g. "Morgan Stanley Client Services" → "Morgan Stanley"
 */
function shortenName(name: string): string {
  // Known shortenings
  const lower = name.toLowerCase();
  if (lower.includes('morgan stanley')) {
    return 'Morgan Stanley';
  }
  if (lower.includes('interactive brokers')) {
    return 'IBKR';
  }
  if (lower.includes('charles schwab')) {
    return 'Schwab';
  }
  if (lower.includes('td ameritrade')) {
    return 'TD Ameritrade';
  }
  if (lower.includes('goldman sachs')) {
    return 'Goldman Sachs';
  }
  if (lower.includes('jp morgan') || lower.includes('jpmorgan')) {
    return 'JPMorgan';
  }
  if (lower.includes('wells fargo')) {
    return 'Wells Fargo';
  }
  // If longer than 18 chars, truncate
  if (name.length > 18) {
    return name.substring(0, 16) + '…';
  }
  return name;
}

// ─── Props ──────────────────────────────────────────────────────────────────

type Props = {
  /** All unique account names derived from activity items */
  accountNames: string[];
  /** Currently selected account filter — null means "All Accounts" */
  selectedAccount: string | null;
  /** Callback when the user taps a pill */
  onSelectAccount: (account: string | null) => void;
};

// ─── Component ──────────────────────────────────────────────────────────────

export const AccountFilter = React.memo(({ accountNames, selectedAccount, onSelectAccount }: Props) => {
  const handlePressAll = useCallback(() => {
    onSelectAccount(null);
  }, [onSelectAccount]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      horizontal
      style={styles.container}
      nestedScrollEnabled
      contentContainerStyle={styles.contentContainer}
      showsHorizontalScrollIndicator={false}>
      {/* "All Accounts" pill */}
      <Touchable onPress={handlePressAll}>
        <Pill backgroundColor={selectedAccount === null ? 'light8' : 'dark15'}>
          <Label color="light100" type="boldCaption1" style={styles.label}>
            All Accounts
          </Label>
        </Pill>
      </Touchable>

      {/* One pill per unique account */}
      {accountNames.map(name => {
        const isSelected = selectedAccount === name;
        const accentColor = getInstitutionColor(name);
        const shortName = shortenName(name);

        return (
          <Touchable key={name} onPress={() => onSelectAccount(name)}>
            <Pill backgroundColor={isSelected ? 'light8' : 'dark15'}>
              {/* Tiny coloured dot representing the institution */}
              <View style={[styles.dot, { backgroundColor: accentColor }]} />
              <Label color="light100" type="boldCaption1" style={styles.label}>
                {shortName}
              </Label>
            </Pill>
          </Touchable>
        );
      })}
    </ScrollView>
  );
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxHeight: 60,
  },
  contentContainer: {
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  label: {
    lineHeight: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

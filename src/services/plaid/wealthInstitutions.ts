/**
 * Wealth Management Institutions — Plaid-connected, read-only tracking.
 *
 * Matches the institution list from the Vibe-Trading PlaidConnector component.
 * These are popular wealth management & advisory firms that users can connect
 * via Plaid for read-only portfolio tracking (not trading).
 *
 * Logos are bundled locally — copied from Vibe-Trading's /public/logos/.
 */

import type { ImageSourcePropType } from 'react-native';

export interface WealthInstitution {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Bundled logo image (require) — matches Vibe-Trading PlaidConnector */
  logo: ImageSourcePropType;
  /** Whether the logo needs a white background */
  needsWhiteBg: boolean;
  /** Two-letter fallback shown in the avatar circle */
  fallback: string;
  /** Brand colour for the fallback letters */
  color: string;
}

/* eslint-disable @typescript-eslint/no-require-imports */
export const WEALTH_INSTITUTIONS: WealthInstitution[] = [
  {
    id: 'morgan-stanley',
    name: 'Morgan Stanley',
    logo: require('@/assets/brokerLogos/morgan-stanley.png'),
    needsWhiteBg: false,
    fallback: 'MS',
    color: '#003986',
  },
  {
    id: 'goldman-sachs',
    name: 'Goldman Sachs',
    logo: require('@/assets/brokerLogos/goldman-sachs.png'),
    needsWhiteBg: false,
    fallback: 'GS',
    color: '#6F9FD8',
  },
  {
    id: 'merrill-lynch',
    name: 'Merrill Lynch',
    logo: require('@/assets/brokerLogos/merrill-lynch.png'),
    needsWhiteBg: true,
    fallback: 'ML',
    color: '#0060A9',
  },
  {
    id: 'jp-morgan',
    name: 'J.P. Morgan',
    logo: require('@/assets/brokerLogos/jp-morgan.png'),
    needsWhiteBg: false,
    fallback: 'JP',
    color: '#003A70',
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    logo: require('@/assets/brokerLogos/vanguard.png'),
    needsWhiteBg: false,
    fallback: 'VG',
    color: '#952726',
  },
  {
    id: 'ubs',
    name: 'UBS',
    logo: require('@/assets/brokerLogos/ubs.png'),
    needsWhiteBg: true,
    fallback: 'UB',
    color: '#E60000',
  },
  {
    id: 'wells-fargo',
    name: 'Wells Fargo Advisors',
    logo: require('@/assets/brokerLogos/wells-fargo.png'),
    needsWhiteBg: false,
    fallback: 'WF',
    color: '#D71E28',
  },
  {
    id: 'edward-jones',
    name: 'Edward Jones',
    logo: require('@/assets/brokerLogos/edward-jones.png'),
    needsWhiteBg: false,
    fallback: 'EJ',
    color: '#2D6A4F',
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Find a wealth institution by matching against the name (fuzzy).
 * Useful for looking up the bundled logo when you only have the institution name
 * from Plaid (e.g. "Morgan Stanley Client Services" → morgan-stanley entry).
 */
export function findWealthInstitution(name: string): WealthInstitution | undefined {
  const lower = name.trim().toLowerCase();
  return WEALTH_INSTITUTIONS.find(inst => {
    const instLower = inst.name.toLowerCase();
    // "Morgan Stanley Client Services" contains "morgan stanley"
    return lower.includes(instLower) || instLower.includes(lower);
  });
}

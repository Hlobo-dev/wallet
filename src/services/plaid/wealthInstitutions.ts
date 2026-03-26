/**
 * Wealth Management Institutions — Plaid-connected, read-only tracking.
 *
 * Matches the institution list from the Vibe-Trading PlaidConnector component.
 * These are popular wealth management & advisory firms that users can connect
 * via Plaid for read-only portfolio tracking (not trading).
 */

export interface WealthInstitution {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Two-letter fallback shown in the avatar circle */
  fallback: string;
  /** Brand colour for the fallback letters */
  color: string;
}

export const WEALTH_INSTITUTIONS: WealthInstitution[] = [
  {
    id: 'morgan-stanley',
    name: 'Morgan Stanley',
    fallback: 'MS',
    color: '#003986',
  },
  {
    id: 'goldman-sachs',
    name: 'Goldman Sachs',
    fallback: 'GS',
    color: '#6F9FD8',
  },
  {
    id: 'merrill-lynch',
    name: 'Merrill Lynch',
    fallback: 'ML',
    color: '#0060A9',
  },
  {
    id: 'jp-morgan',
    name: 'J.P. Morgan',
    fallback: 'JP',
    color: '#003A70',
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    fallback: 'VG',
    color: '#952726',
  },
  {
    id: 'ubs',
    name: 'UBS',
    fallback: 'UB',
    color: '#E60000',
  },
  {
    id: 'wells-fargo',
    name: 'Wells Fargo Advisors',
    fallback: 'WF',
    color: '#D71E28',
  },
  {
    id: 'edward-jones',
    name: 'Edward Jones',
    fallback: 'EJ',
    color: '#2D6A4F',
  },
];

/**
 * Static brokerage information for the "Select your brokerage" card.
 *
 * Matches the broker list from the Vibe-Trading platform (brokerCapabilities.ts).
 * Logo URLs point to each brokerage's public logo.
 */

export interface BrokerageInfo {
  slug: string;
  name: string;
  /** Remote URL for the brokerage logo */
  logoUrl: string;
  /** Fallback background colour for the avatar when the image fails to load */
  color: string;
  /** SnapTrade integration type */
  integrationType: 'snaptrade' | 'native';
  /** Whether live trading is supported (false = read-only / portfolio tracking) */
  supportsTrading: boolean;
}

export const BROKERAGES: BrokerageInfo[] = [
  {
    slug: 'INTERACTIVE_BROKERS',
    name: 'Interactive Brokers',
    logoUrl: 'https://logo.clearbit.com/interactivebrokers.com',
    color: '#D32F2F',
    integrationType: 'native',
    supportsTrading: true,
  },
  {
    slug: 'HYPERLIQUID',
    name: 'Hyperliquid',
    logoUrl: 'https://logo.clearbit.com/hyperliquid.xyz',
    color: '#1A1A2E',
    integrationType: 'native',
    supportsTrading: true,
  },
  {
    slug: 'KRAKEN',
    name: 'Kraken',
    logoUrl: 'https://logo.clearbit.com/kraken.com',
    color: '#5741D9',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'COINBASE',
    name: 'Coinbase',
    logoUrl: 'https://logo.clearbit.com/coinbase.com',
    color: '#0052FF',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'ALPACA_PAPER',
    name: 'Alpaca Paper',
    logoUrl: 'https://logo.clearbit.com/alpaca.markets',
    color: '#F5A623',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'WEBULL',
    name: 'Webull',
    logoUrl: 'https://logo.clearbit.com/webull.com',
    color: '#E8E8E8',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'ROBINHOOD',
    name: 'Robinhood',
    logoUrl: 'https://logo.clearbit.com/robinhood.com',
    color: '#BFFF00',
    integrationType: 'snaptrade',
    supportsTrading: false,
  },
  {
    slug: 'SCHWAB',
    name: 'Charles Schwab',
    logoUrl: 'https://logo.clearbit.com/schwab.com',
    color: '#00A3E0',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'ETRADE',
    name: 'E*TRADE',
    logoUrl: 'https://logo.clearbit.com/etrade.com',
    color: '#6B2FA0',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'TASTYTRADE',
    name: 'tastytrade',
    logoUrl: 'https://logo.clearbit.com/tastytrade.com',
    color: '#FF4444',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'TRADESTATION',
    name: 'TradeStation',
    logoUrl: 'https://logo.clearbit.com/tradestation.com',
    color: '#0072CE',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'FIDELITY',
    name: 'Fidelity',
    logoUrl: 'https://logo.clearbit.com/fidelity.com',
    color: '#4A8C3F',
    integrationType: 'snaptrade',
    supportsTrading: false,
  },
  {
    slug: 'VANGUARD',
    name: 'Vanguard',
    logoUrl: 'https://logo.clearbit.com/vanguard.com',
    color: '#96171B',
    integrationType: 'snaptrade',
    supportsTrading: false,
  },
  {
    slug: 'ALPACA',
    name: 'Alpaca',
    logoUrl: 'https://logo.clearbit.com/alpaca.markets',
    color: '#F5A623',
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
];

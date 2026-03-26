/**
 * Static brokerage information for the "Select your brokerage" card.
 *
 * Matches the broker list from the Vibe-Trading platform (BrokerConnector.tsx).
 * Logo images are bundled locally — copied from Vibe-Trading's /public/logos/.
 */

import type { ImageSourcePropType } from 'react-native';

export interface BrokerageInfo {
  slug: string;
  name: string;
  /** Bundled logo image (require) */
  logo: ImageSourcePropType;
  /** Whether the logo needs a white background (dark logos on transparent bg) */
  needsWhiteBg: boolean;
  /** Use contain instead of cover (for logos that shouldn't be cropped) */
  useContain: boolean;
  /** SnapTrade integration type */
  integrationType: 'snaptrade' | 'native';
  /** Whether live trading is supported (false = read-only / portfolio tracking) */
  supportsTrading: boolean;
}

/* eslint-disable @typescript-eslint/no-require-imports */
export const BROKERAGES: BrokerageInfo[] = [
  {
    slug: 'INTERACTIVE-BROKERS-FLEX',
    name: 'Interactive Brokers',
    logo: require('@/assets/brokerLogos/interactive-brokers.jpeg'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'native',
    supportsTrading: true,
  },
  {
    slug: 'HYPERLIQUID',
    name: 'Hyperliquid',
    logo: require('@/assets/brokerLogos/hyperliquid.png'),
    needsWhiteBg: true,
    useContain: true,
    integrationType: 'native',
    supportsTrading: true,
  },
  {
    slug: 'KRAKEN',
    name: 'Kraken',
    logo: require('@/assets/brokerLogos/kraken.jpg'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'COINBASE',
    name: 'Coinbase',
    logo: require('@/assets/brokerLogos/coinbase.png'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'ALPACA-PAPER',
    name: 'Alpaca Paper',
    logo: require('@/assets/brokerLogos/alpaca.png'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'WEBULL',
    name: 'Webull',
    logo: require('@/assets/brokerLogos/webull.png'),
    needsWhiteBg: true,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'ROBINHOOD',
    name: 'Robinhood',
    logo: require('@/assets/brokerLogos/robinhood.jpeg'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: false,
  },
  {
    slug: 'SCHWAB',
    name: 'Charles Schwab',
    logo: require('@/assets/brokerLogos/charles-schwab.png'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'ETRADE',
    name: 'E*TRADE',
    logo: require('@/assets/brokerLogos/etrade.png'),
    needsWhiteBg: true,
    useContain: true,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'TASTYTRADE',
    name: 'tastytrade',
    logo: require('@/assets/brokerLogos/tastytrade.png'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'TRADESTATION',
    name: 'TradeStation',
    logo: require('@/assets/brokerLogos/tradestation.jpg'),
    needsWhiteBg: true,
    useContain: true,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
  {
    slug: 'FIDELITY',
    name: 'Fidelity',
    logo: require('@/assets/brokerLogos/fidelity.jpeg'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: false,
  },
  {
    slug: 'VANGUARD',
    name: 'Vanguard',
    logo: require('@/assets/brokerLogos/vanguard.png'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: false,
  },
  {
    slug: 'ALPACA',
    name: 'Alpaca',
    logo: require('@/assets/brokerLogos/alpaca.png'),
    needsWhiteBg: false,
    useContain: false,
    integrationType: 'snaptrade',
    supportsTrading: true,
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

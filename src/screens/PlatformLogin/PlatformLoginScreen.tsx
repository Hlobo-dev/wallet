/**
 * PlatformLoginScreen — Kraken-style welcome screen with live market data.
 *
 * Layout (top → bottom):
 * 1. Header with user icon
 * 2. Branded logo + "Welcome to Nuble" + subtitle
 * 3. Category tabs: Most popular | Gainers | Losers | New
 * 4. Market rows — coin icon, name/symbol, sparkline, price, 24h change
 * 5. Bottom sticky bar: "Sign in" + "Create account"
 *
 * On button tap a bottom-sheet slides up with email/password form.
 * Market data sourced from CoinGecko public API (no key needed).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useNubleAuth } from '@/providers/NubleAuthProvider';
import { PlatformAuthError } from '@/services/nublePlatform';

import EthereumIcon from '../../../assets/kraken-wallet-network-icons/src/ethereum.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  sparkline_in_7d?: { price: number[] };
}

type MarketTab = 'popular' | 'gainers' | 'losers' | 'new';
type AuthMode = 'login' | 'register';

// ─── CoinGecko fetch ────────────────────────────────────────────────────────

const COINGECKO = 'https://api.coingecko.com/api/v3';

async function fetchMarketData(): Promise<CoinData[]> {
  try {
    const res = await fetch(
      `${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`,
    );
    if (!res.ok) {
      return fallbackData();
    }
    return res.json();
  } catch {
    return fallbackData();
  }
}

function fallbackData(): CoinData[] {
  return [
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: '', current_price: 68202, price_change_percentage_24h: -1.48 },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', image: '', current_price: 2064.71, price_change_percentage_24h: -1.66 },
    { id: 'binancecoin', symbol: 'bnb', name: 'BNB Chain', image: '', current_price: 629.5, price_change_percentage_24h: -0.71 },
    { id: 'ripple', symbol: 'xrp', name: 'XRP', image: '', current_price: 1.39, price_change_percentage_24h: -2.1 },
    { id: 'solana', symbol: 'sol', name: 'Solana', image: '', current_price: 172.5, price_change_percentage_24h: 3.2 },
    { id: 'cardano', symbol: 'ada', name: 'Cardano', image: '', current_price: 0.72, price_change_percentage_24h: -0.9 },
    { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', image: '', current_price: 0.162, price_change_percentage_24h: 1.4 },
    { id: 'tron', symbol: 'trx', name: 'TRON', image: '', current_price: 0.124, price_change_percentage_24h: 0.3 },
  ];
}

// ─── Sparkline Mini-Chart (SVG line) ────────────────────────────────────────

const SparklineChart: React.FC<{
  data: number[];
  isPositive: boolean;
  width?: number;
  height?: number;
}> = ({ data, isPositive, width = 64, height = 28 }) => {
  if (!data || data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const step = Math.max(1, Math.floor(data.length / 30));
  const sampled = data.filter((_, i) => i % step === 0);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;
  const color = isPositive ? '#22C55E' : '#EF4444';

  const points = sampled.map((val, i) => {
    const x = (i / (sampled.length - 1)) * width;
    const y = height - 2 - ((val - min) / range) * (height - 4);
    return { x, y };
  });

  // Build smooth SVG path
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={d} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

// ─── Coin logo ──────────────────────────────────────────────────────────────

const COIN_COLORS: Record<string, string> = {
  btc: '#F7931A', eth: '#627EEA', bnb: '#F3BA2F', xrp: '#23292F',
  sol: '#9945FF', ada: '#0033AD', doge: '#C2A633', trx: '#FF0013',
  avax: '#E84142', dot: '#E6007A', matic: '#8247E5', link: '#2A5ADA',
  uni: '#FF007A', atom: '#2E3148', ltc: '#345D9D', shib: '#FFA409',
  usdt: '#26A17B', usdc: '#2775CA', ton: '#0098EA', xmr: '#FF6600',
};

const CoinLogo: React.FC<{ symbol: string; imageUrl: string; size?: number }> = ({
  symbol, imageUrl, size = 40,
}) => {
  const [failed, setFailed] = useState(false);
  const bg = COIN_COLORS[symbol.toLowerCase()] || '#6366F1';

  // Use local SVG for Ethereum
  if (symbol.toLowerCase() === 'eth') {
    return <EthereumIcon width={size} height={size} />;
  }

  if (!imageUrl || failed) {
    return (
      <View style={[s.coinFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        <Text style={[s.coinFallbackText, { fontSize: size * 0.38 }]}>
          {symbol.toUpperCase().slice(0, 2)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setFailed(true)}
    />
  );
};

// ─── Format helpers ─────────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 1000) {
    return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (p >= 1) {
    return `$${p.toFixed(2)}`;
  }
  return `$${p.toFixed(p >= 0.01 ? 3 : 6)}`;
}

function fmtChange(c: number): string {
  return `${Math.abs(c).toFixed(2)}%`;
}

// ─── Market Row ─────────────────────────────────────────────────────────────

const MarketRow: React.FC<{ coin: CoinData }> = React.memo(({ coin }) => {
  const pos = coin.price_change_percentage_24h >= 0;
  const color = pos ? '#22C55E' : '#EF4444';
  const arrow = pos ? '↗' : '↘';
  const spark = coin.sparkline_in_7d?.price?.slice(-48) ?? [];

  return (
    <View style={s.row}>
      <CoinLogo symbol={coin.symbol} imageUrl={coin.image} size={40} />
      <View style={s.rowInfo}>
        <Text style={s.rowName} numberOfLines={1}>{coin.name}</Text>
        <Text style={s.rowSymbol}>{coin.symbol.toUpperCase()}</Text>
      </View>
      <View style={s.rowChart}>
        <SparklineChart data={spark} isPositive={pos} />
      </View>
      <View style={s.rowPriceCol}>
        <Text style={s.rowPrice}>{fmtPrice(coin.current_price)}</Text>
        <Text style={[s.rowChange, { color }]}>
          {arrow} {fmtChange(coin.price_change_percentage_24h)}
        </Text>
      </View>
    </View>
  );
});

// ─── Auth Bottom Sheet ──────────────────────────────────────────────────────

const AuthSheet: React.FC<{
  visible: boolean;
  mode: AuthMode;
  onClose: () => void;
  onToggleMode: () => void;
}> = ({ visible, mode, onClose, onToggleMode }) => {
  const insets = useSafeAreaInsets();
  const { login, register } = useNubleAuth();
  const slide = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slide]);

  useEffect(() => { setError(null); }, [mode]);

  const valid =
    mode === 'login'
      ? email.trim().length > 0 && password.length >= 6
      : email.trim().length > 0 && password.length >= 6 && firstName.trim().length > 0;

  const submit = useCallback(async () => {
    if (!valid || loading) { return; }
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, firstName.trim(), lastName.trim());
      }
    } catch (e) {
      if (e instanceof PlatformAuthError) {
        setError(e.message);
      } else {
        setError('Unable to connect. Check your network and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, firstName, lastName, valid, loading, login, register]);

  if (!visible) { return null; }

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={s.backdrop} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      <KeyboardAvoidingView
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[s.sheet, { transform: [{ translateY }], paddingBottom: insets.bottom + 16, position: 'relative' }]}
        >
          <View style={s.handle} />
          <Text style={s.sheetTitle}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Text>

            {mode === 'register' && (
              <View style={s.nameRow}>
                <TextInput style={[s.input, s.nameInput]} placeholder="First name" placeholderTextColor="#666" value={firstName} onChangeText={setFirstName} autoCapitalize="words" editable={!loading} />
                <TextInput style={[s.input, s.nameInput]} placeholder="Last name" placeholderTextColor="#666" value={lastName} onChangeText={setLastName} autoCapitalize="words" editable={!loading} />
              </View>
            )}

            <TextInput style={s.input} placeholder="Email address" placeholderTextColor="#666" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!loading} />
            <TextInput style={s.input} placeholder="Password" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'password' : 'new-password'} editable={!loading} />

            {error && <Text style={s.sheetError}>{error}</Text>}

            <TouchableOpacity
              style={[s.sheetSubmit, (!valid || loading) && s.sheetSubmitOff]}
              onPress={submit}
              disabled={!valid || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.sheetSubmitText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
              )}
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.socialRow}>
              <Pressable
                style={({ pressed }) => [s.socialBtn, pressed && { opacity: 0.6 }]}
                onPress={() => Alert.alert('Google Sign-In', 'Google authentication coming soon!')}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </Svg>
                <Text style={s.socialLabel}>Sign in with Google</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.socialBtn, pressed && { opacity: 0.6 }]}
                onPress={() => Alert.alert('Apple Sign-In', 'Apple authentication coming soon!')}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="#d1d5db">
                  <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </Svg>
                <Text style={s.socialLabel}>Sign in with Apple</Text>
              </Pressable>
            </View>

            <TouchableOpacity onPress={onToggleMode} style={s.toggle} disabled={loading}>
              <Text style={s.toggleText}>
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <Text style={s.toggleLink}>{mode === 'login' ? 'Sign up' : 'Sign in'}</Text>
              </Text>
            </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
      </View>
  );
};

// ─── SVG icons for Account page ─────────────────────────────────────────────

const ChevronRight: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = 'rgba(255,255,255,0.35)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const BackArrow: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'rgba(255,255,255,0.75)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const GearIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 15a3 3 0 100-6 3 3 0 000 6z"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
    <Path
      d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

const HeadphonesIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 18v-6a9 9 0 0118 0v6"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
    <Path
      d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

const BuildingIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 21h18M5 21V7l8-4v18M13 21V11l6 2v8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

// ─── SVG icons for Preferences page ─────────────────────────────────────────

const DollarIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
    <Path d="M12 7v1m0 8v1m-2.5-8.5c0 0 .5-1 2.5-1s2.5 1 2.5 2.25S13 12 12 12s-2.5.25-2.5 1.75S10.5 16 12.5 16s2.5-1 2.5-1" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const GlobeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
    <Path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const MoonIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const TypeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 7V4h16v3M9 20h6M12 4v16" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const VibrateIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8 4h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M2 8v8M22 8v8" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

// ─── Preferences Page (slides in from right) ───────────────────────────────

const CheckIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = '#FFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

interface CurrencyOption {
  code: string;
  name: string;
  flag: string;
  flagImg: string;
}

const flagUrl = (cc: string) => `https://flagcdn.com/w160/${cc.toLowerCase()}.png`;

const CURRENCIES: CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸', flagImg: flagUrl('us') },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺', flagImg: flagUrl('eu') },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦', flagImg: flagUrl('ca') },
  { code: 'GBP', name: 'Pound Sterling', flag: '🇬🇧', flagImg: flagUrl('gb') },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', flagImg: flagUrl('ch') },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺', flagImg: flagUrl('au') },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵', flagImg: flagUrl('jp') },
  { code: 'KRW', name: 'South Korean Won', flag: '🇰🇷', flagImg: flagUrl('kr') },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳', flagImg: flagUrl('cn') },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳', flagImg: flagUrl('in') },
  { code: 'BRL', name: 'Brazilian Real', flag: '🇧🇷', flagImg: flagUrl('br') },
  { code: 'MXN', name: 'Mexican Peso', flag: '🇲🇽', flagImg: flagUrl('mx') },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬', flagImg: flagUrl('sg') },
  { code: 'HKD', name: 'Hong Kong Dollar', flag: '🇭🇰', flagImg: flagUrl('hk') },
  { code: 'NZD', name: 'New Zealand Dollar', flag: '🇳🇿', flagImg: flagUrl('nz') },
  { code: 'SEK', name: 'Swedish Krona', flag: '🇸🇪', flagImg: flagUrl('se') },
  { code: 'NOK', name: 'Norwegian Krone', flag: '🇳🇴', flagImg: flagUrl('no') },
  { code: 'DKK', name: 'Danish Krone', flag: '🇩🇰', flagImg: flagUrl('dk') },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦', flagImg: flagUrl('za') },
  { code: 'TRY', name: 'Turkish Lira', flag: '🇹🇷', flagImg: flagUrl('tr') },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪', flagImg: flagUrl('ae') },
  { code: 'PLN', name: 'Polish Zloty', flag: '🇵🇱', flagImg: flagUrl('pl') },
  { code: 'THB', name: 'Thai Baht', flag: '🇹🇭', flagImg: flagUrl('th') },
];

const CurrencySheet: React.FC<{
  visible: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}> = ({ visible, selected, onSelect, onClose }) => {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slide]);

  if (!visible) { return null; }

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [800, 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={curr.backdrop} onPress={onClose} />
      <Animated.View
        style={[curr.sheet, { transform: [{ translateY }], paddingBottom: insets.bottom + 16 }]}
      >
        <View style={curr.handle} />
        <Text style={curr.sheetTitle}>Currency</Text>
        <ScrollView
          style={{ maxHeight: 480 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {CURRENCIES.map((c, i) => (
            <TouchableOpacity
              key={c.code}
              style={curr.row}
              activeOpacity={0.6}
              onPress={() => onSelect(c.code)}
            >
              <View style={curr.flagCircle}>
                <Image source={{ uri: c.flagImg }} style={curr.flagImage} />
              </View>
              <View style={curr.rowInfo}>
                <Text style={curr.rowName}>{c.name}</Text>
                <Text style={curr.rowCode}>{c.code}</Text>
              </View>
              {selected === c.code && <CheckIcon />}
              {i < CURRENCIES.length - 1 && (
                <View style={[curr.rowDivider, { position: 'absolute', bottom: 0, left: 74, right: 0 }]} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const curr = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A3E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  flagCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  flagImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  rowCode: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});

// ─── Language Page (slides in from right) ───────────────────────────────────

// ─── SVG icons for Theme sheet ──────────────────────────────────────────────

const SunIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
    <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const AutoIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = 'rgba(255,255,255,0.55)' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
    <Path d="M12 3a9 9 0 010 18V3z" fill={color} />
  </Svg>
);

type ThemeOption = 'Light' | 'Dark' | 'Auto';

const THEME_OPTIONS: { key: ThemeOption; label: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
  { key: 'Light', label: 'Light', Icon: SunIcon },
  { key: 'Dark', label: 'Dark', Icon: MoonIcon },
  { key: 'Auto', label: 'Auto', Icon: AutoIcon },
];

const ThemeSheet: React.FC<{
  visible: boolean;
  selected: ThemeOption;
  onSelect: (theme: ThemeOption) => void;
  onClose: () => void;
}> = ({ visible, selected, onSelect, onClose }) => {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slide]);

  if (!visible) { return null; }

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={curr.backdrop} onPress={onClose} />
      <Animated.View
        style={[curr.sheet, { transform: [{ translateY }], paddingBottom: insets.bottom + 24 }]}
      >
        <View style={curr.handle} />
        <Text style={curr.sheetTitle}>Theme</Text>
        {THEME_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt.key}
            style={thm.row}
            activeOpacity={0.6}
            onPress={() => onSelect(opt.key)}
          >
            <View style={thm.iconCircle}>
              <opt.Icon size={22} color="rgba(255,255,255,0.55)" />
            </View>
            <Text style={thm.label}>{opt.label}</Text>
            {selected === opt.key && <CheckIcon size={20} />}
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
};

const thm = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

// ─── Number Format Sheet ────────────────────────────────────────────────────

const NUMBER_FORMATS = ['1,234,567.89', '1.234.567,89', '1 234 567,89'];

const NumberFormatSheet: React.FC<{
  visible: boolean;
  selected: string;
  onSelect: (fmt: string) => void;
  onClose: () => void;
}> = ({ visible, selected, onSelect, onClose }) => {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slide]);

  if (!visible) { return null; }

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={curr.backdrop} onPress={onClose} />
      <Animated.View
        style={[curr.sheet, { transform: [{ translateY }], paddingBottom: insets.bottom + 24 }]}
      >
        <View style={curr.handle} />
        <Text style={curr.sheetTitle}>Number format</Text>
        {NUMBER_FORMATS.map((fmt) => (
          <TouchableOpacity
            key={fmt}
            style={nfmt.row}
            activeOpacity={0.6}
            onPress={() => onSelect(fmt)}
          >
            <Text style={nfmt.label}>{fmt}</Text>
            {selected === fmt && <CheckIcon size={20} />}
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
};

const nfmt = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
    color: '#FFF',
  },
});

const LANGUAGES = [
  'Bahasa Melayu',
  'Čeština',
  'Dansk',
  'Deutsch',
  'English (Australia)',
  'English (Canada)',
  'English (Pirate)',
  'English (UK)',
  'English (US)',
  'Español (Argentina)',
  'Español (España)',
  'Español (Latinoamérica)',
  'Español (México)',
  'Français',
  'Italiano',
  'Magyar',
  'Nederlands',
  'Norsk',
  'Polski',
  'Português (Brasil)',
  'Português (Portugal)',
  'Română',
  'Slovenčina',
  'Suomi',
  'Svenska',
  'Tiếng Việt',
  'Türkçe',
  'Ελληνικά',
  'Русский',
  'Українська',
  '中文 (简体)',
  '中文 (繁體)',
  '日本語',
  '한국어',
];

const LanguagePage: React.FC<{
  visible: boolean;
  selected: string;
  onSelect: (lang: string) => void;
  onClose: () => void;
}> = ({ visible, selected, onSelect, onClose }) => {
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    Animated.spring(slideX, {
      toValue: visible ? 0 : SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slideX]);

  if (!visible) { return null; }

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: '#0D0D2E', transform: [{ translateX: slideX }] },
      ]}
    >
      {/* Header */}
      <View style={[acct.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={onClose} style={acct.backBtn} activeOpacity={0.7}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={acct.headerTitle}>Language</Text>
        <View style={acct.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {LANGUAGES.map((lang, i) => (
          <TouchableOpacity
            key={lang}
            style={lang_s.row}
            activeOpacity={0.6}
            onPress={() => onSelect(lang)}
          >
            <Text style={lang_s.label}>{lang}</Text>
            {selected === lang && <CheckIcon size={20} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );
};

const lang_s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
    color: '#FFF',
  },
});

const PreferencesPage: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [haptic, setHaptic] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English (US)');
  const [languagePageVisible, setLanguagePageVisible] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('Dark');
  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const [selectedNumberFormat, setSelectedNumberFormat] = useState('1,234,567.89');
  const [numberFormatSheetVisible, setNumberFormatSheetVisible] = useState(false);

  const openCurrencySheet = useCallback(() => setCurrencySheetVisible(true), []);
  const closeCurrencySheet = useCallback(() => setCurrencySheetVisible(false), []);
  const handleSelectCurrency = useCallback((code: string) => {
    setSelectedCurrency(code);
    setCurrencySheetVisible(false);
  }, []);

  const openLanguagePage = useCallback(() => setLanguagePageVisible(true), []);
  const closeLanguagePage = useCallback(() => setLanguagePageVisible(false), []);
  const handleSelectLanguage = useCallback((lang: string) => {
    setSelectedLanguage(lang);
    setLanguagePageVisible(false);
  }, []);

  const openThemeSheet = useCallback(() => setThemeSheetVisible(true), []);
  const closeThemeSheet = useCallback(() => setThemeSheetVisible(false), []);
  const handleSelectTheme = useCallback((theme: ThemeOption) => {
    setSelectedTheme(theme);
    setThemeSheetVisible(false);
  }, []);

  const openNumberFormatSheet = useCallback(() => setNumberFormatSheetVisible(true), []);
  const closeNumberFormatSheet = useCallback(() => setNumberFormatSheetVisible(false), []);
  const handleSelectNumberFormat = useCallback((fmt: string) => {
    setSelectedNumberFormat(fmt);
    setNumberFormatSheetVisible(false);
  }, []);

  useEffect(() => {
    Animated.spring(slideX, {
      toValue: visible ? 0 : SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slideX]);

  if (!visible) { return null; }

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: '#0D0D2E', transform: [{ translateX: slideX }] },
      ]}
    >
      {/* Header */}
      <View style={[acct.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={onClose} style={acct.backBtn} activeOpacity={0.7}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={acct.headerTitle}>Preferences</Text>
        <View style={acct.backBtn} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        {/* Currency */}
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6} onPress={openCurrencySheet}>
          <View style={acct.menuIcon}>
            <DollarIcon />
          </View>
          <Text style={acct.menuLabel}>Currency</Text>
          <Text style={pref.valueText}>{selectedCurrency}</Text>
          <ChevronRight />
        </TouchableOpacity>
        <View style={acct.menuDivider} />

        {/* Language */}
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6} onPress={openLanguagePage}>
          <View style={acct.menuIcon}>
            <GlobeIcon />
          </View>
          <Text style={acct.menuLabel}>Language</Text>
          <Text style={pref.valueText}>{selectedLanguage}</Text>
          <ChevronRight />
        </TouchableOpacity>
        <View style={acct.menuDivider} />

        {/* Theme */}
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6} onPress={openThemeSheet}>
          <View style={acct.menuIcon}>
            <MoonIcon />
          </View>
          <Text style={acct.menuLabel}>Theme</Text>
          <Text style={pref.valueText}>{selectedTheme}</Text>
          <ChevronRight />
        </TouchableOpacity>
        <View style={acct.menuDivider} />

        {/* Number format */}
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6} onPress={openNumberFormatSheet}>
          <View style={acct.menuIcon}>
            <TypeIcon />
          </View>
          <Text style={acct.menuLabel}>Number format</Text>
          <Text style={pref.valueText}>{selectedNumberFormat}</Text>
          <ChevronRight />
        </TouchableOpacity>
        <View style={acct.menuDivider} />

        {/* Haptic feedback */}
        <View style={acct.menuRow}>
          <View style={acct.menuIcon}>
            <VibrateIcon />
          </View>
          <Text style={acct.menuLabel}>Haptic feedback</Text>
          <View style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}>
            <Switch
              value={haptic}
              onValueChange={setHaptic}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#3DA667' }}
              thumbColor="#FFF"
              ios_backgroundColor="rgba(255,255,255,0.15)"
            />
          </View>
        </View>
      </ScrollView>

      <CurrencySheet
        visible={currencySheetVisible}
        selected={selectedCurrency}
        onSelect={handleSelectCurrency}
        onClose={closeCurrencySheet}
      />

      <LanguagePage
        visible={languagePageVisible}
        selected={selectedLanguage}
        onSelect={handleSelectLanguage}
        onClose={closeLanguagePage}
      />

      <ThemeSheet
        visible={themeSheetVisible}
        selected={selectedTheme}
        onSelect={handleSelectTheme}
        onClose={closeThemeSheet}
      />

      <NumberFormatSheet
        visible={numberFormatSheetVisible}
        selected={selectedNumberFormat}
        onSelect={handleSelectNumberFormat}
        onClose={closeNumberFormatSheet}
      />
    </Animated.View>
  );
};

const pref = StyleSheet.create({
  valueText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    marginRight: 6,
  },
});

// ─── Account Page (slides in from right) ────────────────────────────────────

const AccountPage: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
}> = ({ visible, onClose, onSignIn, onCreateAccount }) => {
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [prefsVisible, setPrefsVisible] = useState(false);

  const openPrefs = useCallback(() => { setPrefsVisible(true); }, []);
  const closePrefs = useCallback(() => { setPrefsVisible(false); }, []);

  useEffect(() => {
    Animated.spring(slideX, {
      toValue: visible ? 0 : SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slideX]);

  if (!visible) { return null; }

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: '#0D0D2E', transform: [{ translateX: slideX }] },
      ]}
    >
      {/* Header */}
      <View style={[acct.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={onClose} style={acct.backBtn} activeOpacity={0.7}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={acct.headerTitle}>Account</Text>
        <View style={acct.backBtn} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Settings Section */}
        <Text style={acct.sectionTitle}>Settings</Text>
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6} onPress={openPrefs}>
          <View style={acct.menuIcon}>
            <GearIcon />
          </View>
          <Text style={acct.menuLabel}>Preferences</Text>
          <ChevronRight />
        </TouchableOpacity>

        {/* More Section */}
        <Text style={acct.sectionTitle}>More</Text>
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6}>
          <View style={acct.menuIcon}>
            <HeadphonesIcon />
          </View>
          <Text style={acct.menuLabel}>Support</Text>
          <ChevronRight />
        </TouchableOpacity>
        <View style={acct.menuDivider} />
        <TouchableOpacity style={acct.menuRow} activeOpacity={0.6}>
          <View style={acct.menuIcon}>
            <BuildingIcon />
          </View>
          <Text style={acct.menuLabel}>About</Text>
          <ChevronRight />
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom buttons */}
      <View style={[acct.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={acct.btnSignIn} onPress={() => { onClose(); onSignIn(); }} activeOpacity={0.8}>
          <Text style={acct.btnSignInText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={acct.btnCreate} onPress={() => { onClose(); onCreateAccount(); }} activeOpacity={0.8}>
          <Text style={acct.btnCreateText}>Create account</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences Sub-page */}
      <PreferencesPage visible={prefsVisible} onClose={closePrefs} />
    </Animated.View>
  );
};

const acct = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', textAlign: 'center' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 68,
    marginRight: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    backgroundColor: '#0D0D2E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  btnSignIn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  btnSignInText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  btnCreate: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: '#7538F5',
    alignItems: 'center',
  },
  btnCreateText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});

// ─── Tab definitions ────────────────────────────────────────────────────────

const TABS: { key: MarketTab; label: string }[] = [
  { key: 'popular', label: 'Most popular' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'new', label: 'New' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════

export const PlatformLoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MarketTab>('popular');
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [accountVisible, setAccountVisible] = useState(false);

  useEffect(() => {
    fetchMarketData().then(d => { setCoins(d); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!coins.length) { return []; }
    switch (tab) {
      case 'popular':
        return coins.slice(0, 15);
      case 'gainers':
        return [...coins].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 15);
      case 'losers':
        return [...coins].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 15);
      case 'new':
        return coins.slice(25, 50);
      default:
        return coins.slice(0, 15);
    }
  }, [coins, tab]);

  const openSignIn = useCallback(() => { setAuthMode('login'); setSheetVisible(true); }, []);
  const openSignUp = useCallback(() => { setAuthMode('register'); setSheetVisible(true); }, []);
  const closeSheet = useCallback(() => { setSheetVisible(false); }, []);
  const toggleMode = useCallback(() => { setAuthMode(m => m === 'login' ? 'register' : 'login'); }, []);
  const openAccount = useCallback(() => { setAccountVisible(true); }, []);
  const closeAccount = useCallback(() => { setAccountVisible(false); }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header icon ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerIcon} onPress={openAccount} activeOpacity={0.7}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={8} r={4} fill="rgba(255,255,255,0.55)" />
            <Path
              d="M4 21c0-4.418 3.582-7 8-7s8 2.582 8 7"
              fill="rgba(255,255,255,0.55)"
            />
          </Svg>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Logo (independent position) ── */}
        <View style={s.logoSection}>
          <View style={s.logoWrap}>
            <Svg width={56} height={56} viewBox="0 0 52 52" fill="none">
              <Line x1={26} y1={8} x2={26} y2={44} stroke="#818cf7" strokeWidth={5} strokeLinecap="round" />
              <Line x1={10} y1={17} x2={42} y2={35} stroke="#818cf7" strokeWidth={5} strokeLinecap="round" />
              <Line x1={10} y1={35} x2={42} y2={17} stroke="#818cf7" strokeWidth={5} strokeLinecap="round" />
              <Circle cx={26} cy={26} r={5} fill="#6366f1" />
            </Svg>
          </View>
        </View>

        {/* ── Hero text ── */}
        <View style={s.hero}>
          <Text style={s.title}>Welcome to Nuble</Text>
          <Text style={s.subtitle}>
            Create your account or sign in to an existing{'\n'}account to build and manage your portfolio.
          </Text>
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsInner}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} style={[s.tab, active && s.tabOn]} onPress={() => setTab(t.key)} activeOpacity={0.7}>
                <Text style={[s.tabLabel, active && s.tabLabelOn]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Market list ── */}
        <View style={s.card}>
          {loading ? (
            <View style={s.loader}><ActivityIndicator size="small" color="#7538F5" /></View>
          ) : (
            filtered.map(c => <MarketRow key={c.id} coin={c} />)
          )}
        </View>
      </ScrollView>

      {/* ── Bottom buttons ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={s.btnSignIn} onPress={openSignIn} activeOpacity={0.8}>
          <Text style={s.btnSignInText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnCreate} onPress={openSignUp} activeOpacity={0.8}>
          <Text style={s.btnCreateText}>Create account</Text>
        </TouchableOpacity>
      </View>

      {/* ── Auth Sheet ── */}
      <AuthSheet visible={sheetVisible} mode={authMode} onClose={closeSheet} onToggleMode={toggleMode} />

      {/* ── Account Page ── */}
      <AccountPage
        visible={accountVisible}
        onClose={closeAccount}
        onSignIn={openSignIn}
        onCreateAccount={openSignUp}
      />
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  /* layout */
  container: { flex: 1, backgroundColor: '#0D0D2E' },
  header: { paddingHorizontal: 16, paddingVertical: 8 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  /* hero */
  logoSection: { alignItems: 'center', paddingTop: 30, paddingBottom: 0 },
  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 80 },
  logoWrap: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(117,56,245,0.12)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

  /* tabs */
  tabs: { maxHeight: 44, marginBottom: 12 },
  tabsInner: { paddingHorizontal: 16, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  tabOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  tabLabelOn: { color: '#FFF' },

  /* market card */
  card: { marginHorizontal: 16, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, overflow: 'hidden' },
  loader: { paddingVertical: 40, alignItems: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#FFF', marginBottom: 2 },
  rowSymbol: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  rowChart: { width: 70, marginHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  rowPriceCol: { alignItems: 'flex-end', minWidth: 90 },
  rowPrice: { fontSize: 15, fontWeight: '600', color: '#FFF', marginBottom: 2 },
  rowChange: { fontSize: 12, fontWeight: '600' },

  /* bottom bar */
  bottomBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 12,
    backgroundColor: '#0D0D2E',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  btnSignIn: {
    flex: 1, paddingVertical: 16, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
  },
  btnSignInText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  btnCreate: {
    flex: 1, paddingVertical: 16, borderRadius: 24,
    backgroundColor: '#7538F5', alignItems: 'center',
  },
  btnCreateText: { fontSize: 16, fontWeight: '600', color: '#FFF' },

  /* coin fallback */
  coinFallback: { justifyContent: 'center', alignItems: 'center' },
  coinFallbackText: { color: '#FFF', fontWeight: '700' },

  /* sheet */
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1A1A3E',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 24, fontWeight: '700', color: '#FFF', marginBottom: 20, textAlign: 'center' },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameInput: { flex: 1 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#FFF', marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  sheetError: { color: '#FF6B6B', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  sheetSubmit: { backgroundColor: '#7538F5', borderRadius: 24, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  sheetSubmitOff: { opacity: 0.35 },
  sheetSubmitText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginHorizontal: 12 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  socialLabel: { color: '#d1d5db', fontSize: 14, fontWeight: '500' },
  toggle: { paddingVertical: 16, alignItems: 'center' },
  toggleText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  toggleLink: { color: '#7538F5', fontWeight: '600' },
});

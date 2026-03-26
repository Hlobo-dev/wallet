/**
 * BrandedSplash — Full-screen splash matching the native BootSplash.
 *
 * Deep purple gradient background with the asterisk logo centered.
 * Use this anywhere a loading/splash state needs to be shown.
 */

import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');

const SplashLogo = () => (
  <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
    <Line x1={26} y1={8} x2={26} y2={44} stroke="#818cf7" strokeWidth={4} strokeLinecap="round" />
    <Line x1={10} y1={17} x2={42} y2={35} stroke="#818cf7" strokeWidth={4} strokeLinecap="round" />
    <Line x1={10} y1={35} x2={42} y2={17} stroke="#818cf7" strokeWidth={4} strokeLinecap="round" />
    <Circle cx={26} cy={26} r={4} fill="#6366f1" />
  </Svg>
);

const SplashBackground = () => (
  <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
    <Defs>
      <LinearGradient id="splashGrad" x1={SW / 2} y1={0} x2={SW / 2} y2={SH} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#1a0a3e" />
        <Stop offset="0.45" stopColor="#1e1050" />
        <Stop offset="1" stopColor="#0d0d2e" />
      </LinearGradient>
    </Defs>
    <Rect width={SW} height={SH} fill="url(#splashGrad)" />
  </Svg>
);

export const BrandedSplash: React.FC = () => (
  <View style={styles.splash}>
    <SplashBackground />
    <SplashLogo />
  </View>
);

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

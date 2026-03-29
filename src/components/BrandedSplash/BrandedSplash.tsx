/**
 * BrandedSplash — Full-screen splash matching the native BootSplash.
 *
 * Deep purple gradient background with the Astellr logo centered.
 * Use this anywhere a loading/splash state needs to be shown.
 */

import React from 'react';
import { Dimensions, Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');

const SplashLogo = () => (
  <Image
    source={require('@/assets/images/astellr-logo.png')}
    style={{ width: 80, height: 80, transform: [{ rotate: '0deg' }] }}
    resizeMode="contain"
  />
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

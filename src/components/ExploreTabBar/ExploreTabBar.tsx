import type { FC } from 'react';

import { BlurView } from '@react-native-community/blur';

import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientItemBackground } from '@/components/GradientItemBackground';
import { SvgIcon } from '@/components/SvgIcon';
import { useTheme } from '@/theme/themes';

import type { ExploreTabBarProps, TabData } from './ExploreTabBar.types';

const TabBarSizes = {
  baseWidth: 212,
  extraWidthPerTab: 56,
  height: 64,
  radius: 70,
  bottomOffset: 22,
};

const svgHitSlop = { top: 16, bottom: 16, left: 0, right: 0 };

const getTabBarWidth = (tabCount: number): number => {
  return TabBarSizes.baseWidth + Math.max(0, tabCount - 3) * TabBarSizes.extraWidthPerTab;
};

const getGlowXPosition = (tabIndex: number, tabCount: number): number => {
  const tabBarWidth = getTabBarWidth(tabCount);
  const usableWidth = tabBarWidth - TabBarSizes.height;
  const spacing = usableWidth / (tabCount - 1);
  return spacing * tabIndex - usableWidth / 2;
};

export const ExploreTabBar: FC<ExploreTabBarProps> = ({
  tabs,
  activeTab = 0,
  showTabs,
}) => {
  const { colors } = useTheme();
  const tabCount = tabs.length;
  const tabBarWidth = getTabBarWidth(tabCount);
  const glowX = useSharedValue(getGlowXPosition(activeTab, tabCount));
  const insets = useSafeAreaInsets();
  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(glowX.value) }],
  }));

  useEffect(() => {
    glowX.value = getGlowXPosition(activeTab, tabCount);
  }, [activeTab, glowX, tabCount]);

  if (!showTabs) {
    return null;
  }

  return (
    <View style={[styles.container, { width: tabBarWidth, bottom: Math.max(insets.bottom, TabBarSizes.bottomOffset), transform: [{ translateX: tabBarWidth / -2 }] }]} pointerEvents="box-none" testID="ExploreTabBar">
      <Animated.View style={[styles.animatedContainer, { width: tabBarWidth }]} entering={FadeInDown.duration(150)} exiting={FadeOutDown.duration(150)}>
        {Platform.OS === 'ios' ? (
          <BlurView
            blurType="ultraThinMaterialDark"
            reducedTransparencyFallbackColor={colors.background}
            style={[StyleSheet.absoluteFill]}
            pointerEvents="none"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.blurBackgroundAndroid }]} pointerEvents="none" />
        )}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GradientItemBackground style={[styles.background, { width: tabBarWidth }]} />
        </View>
        <View style={styles.iconContainer}>
          {tabs.map((tab: TabData, index: number) => {
            const iconColor = activeTab === index ? 'light100' : 'light50';
            return (
              <SvgIcon color={iconColor} name={tab.name} onPress={tab.onPress} hitSlop={svgHitSlop} testID={`ExploreIcon-${tab.name}`} key={`{name}${index}`} />
            );
          })}
        </View>
        <View pointerEvents="none">
          <Animated.Image source={require('./assets/glow.png')} style={[styles.glow, { width: tabBarWidth }, animatedStyles]} resizeMode="contain" />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    height: TabBarSizes.height,
    zIndex: 1,
    elevation: 100,
    bottom: TabBarSizes.bottomOffset,
    left: '50%',
    backgroundColor: 'transparent',
  },
  animatedContainer: {
    height: TabBarSizes.height,
    borderRadius: TabBarSizes.radius,
    overflow: 'hidden',
  },
  background: {
    height: TabBarSizes.height,
    borderRadius: TabBarSizes.radius,
    opacity: 0.5,
  },
  iconContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 24,
    height: TabBarSizes.height,
  },
  glow: {
    position: 'absolute',
    bottom: -40,
  },
});

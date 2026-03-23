import { useState } from 'react';
import { View } from 'react-native';

import { ExploreTabBar } from './ExploreTabBar';

import type { ExploreTabBarProps } from './ExploreTabBar.types';

import type { Meta, StoryObj } from '@storybook/react';

const ExploreTabBarMeta: Meta<typeof ExploreTabBar> = {
  title: 'ExploreTabBar',
  component: ExploreTabBar,
  args: {
    tabs: [
      { name: 'wallet', onPress: () => {} },
      { name: 'compass', onPress: () => {} },
      { name: 'comment', onPress: () => {} },
      { name: 'scan-walletConnect', onPress: () => {} },
    ],
    showTabs: true,
  },
  render: function Render(args: ExploreTabBarProps) {
    const [activeTab, setActiveTab] = useState(0);
    const tabs = (args.tabs ?? []).map((tab, index) => ({
      ...tab,
      onPress: () => setActiveTab(index),
    }));
    return (
      <ExploreTabBar
        tabs={tabs}
        activeTab={activeTab}
        showTabs={args.showTabs}
      />
    );
  },
  decorators: [
    Story => (
      <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Story />
      </View>
    ),
  ],
};

export default ExploreTabBarMeta;

export const Basic: StoryObj<typeof ExploreTabBar> = {};

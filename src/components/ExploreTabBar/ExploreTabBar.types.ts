import type { IconName } from '../SvgIcon';

export type ExploreTabBarProps = {
  tabs: TabData[];
  activeTab?: number;
  showTabs?: boolean;
};

export type TabData = {
  name: IconName;
  onPress: () => void;
};

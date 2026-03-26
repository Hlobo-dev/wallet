import { useNavigation } from '@react-navigation/native';
import { Image, StyleSheet, View } from 'react-native';

import type { ConnectedAccount } from '@/hooks/useConnectedAccounts';

import { GradientItemBackground } from '@/components/GradientItemBackground';
import type { GradientItemBackgroundProps } from '@/components/GradientItemBackground';
import { IconButton } from '@/components/IconButton';
import { Label } from '@/components/Label';
import { type ContextMenuItem, Menu } from '@/components/Menu';
import { SvgIcon } from '@/components/SvgIcon';
import { Touchable } from '@/components/Touchable';

import { Routes } from '@/Routes';

export const CONNECTED_ACCOUNT_ITEM_HEIGHT = 68;

interface Props extends GradientItemBackgroundProps {
  account: ConnectedAccount;
  isFirst?: boolean;
  isLast?: boolean;
  onRemove?: (account: ConnectedAccount) => void;
}

export const ConnectedAccountItem = ({ account, isFirst, isLast, backgroundType, onRemove }: Props) => {
  const navigation = useNavigation();

  const borderTopRadius = isFirst ? { borderTopLeftRadius: 16, borderTopRightRadius: 16 } : {};
  const borderBottomRadius = isLast ? { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 } : {};
  const style = [styles.container, borderTopRadius, borderBottomRadius];

  const handleViewDetails = () => {
    // Navigate to the brokerage / wealth settings screen
    if (account.type === 'brokerage') {
      navigation.navigate(Routes.Settings, { screen: Routes.SettingsWalletCloudBackup, params: { mode: 'brokerage' } });
    } else {
      navigation.navigate(Routes.Settings, { screen: Routes.SettingsWalletCloudBackup, params: { mode: 'wealth' } });
    }
  };

  const handleRemove = () => {
    onRemove?.(account);
  };

  const MENU_ITEMS: ContextMenuItem[] = [
    {
      title: 'View details',
      icon: 'tool',
      onPress: handleViewDetails,
    },
    {
      title: 'Disconnect',
      tintColor: 'red400',
      icon: 'trash',
      onPress: handleRemove,
    },
  ];

  const renderAvatar = () => {
    if (typeof account.logo === 'number') {
      // Bundled image (require())
      return (
        <View style={[styles.avatarCircle, account.needsWhiteBg ? styles.avatarWhiteBg : styles.avatarDefaultBg]}>
          <Image source={account.logo} style={styles.avatarImage} resizeMode="cover" />
        </View>
      );
    }

    if (typeof account.logo === 'string' && account.logo.length > 0) {
      // Remote URI
      return (
        <View style={[styles.avatarCircle, styles.avatarDefaultBg]}>
          <Image source={{ uri: account.logo }} style={styles.avatarImage} resizeMode="cover" />
        </View>
      );
    }

    // Fallback: letter circle
    return (
      <View style={[styles.avatarCircle, styles.avatarDefaultBg]}>
        <Label type="boldBody" style={{ color: account.brandColor ?? '#a78bfa' }}>
          {account.fallback ?? account.name.substring(0, 2).toUpperCase()}
        </Label>
      </View>
    );
  };

  const statusColor = account.status === 'active' ? 'green400' : 'yellow500';
  const typeLabel = account.type === 'brokerage' ? 'Brokerage' : 'Wealth';

  return (
    <Touchable onPress={handleViewDetails} style={style}>
      <GradientItemBackground backgroundType={backgroundType} />
      <View style={styles.left}>
        {renderAvatar()}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Label type="boldTitle2" numberOfLines={1} style={styles.nameLabel}>
              {account.name}
            </Label>
            <SvgIcon name="check-circle-filled" size={14} color={statusColor} style={styles.statusIcon} />
          </View>
          <Label type="regularCaption1" color="light50">
            {typeLabel}
          </Label>
        </View>
      </View>
      <Menu type="context" items={MENU_ITEMS}>
        <IconButton name="more" backgroundColor="light8" />
      </Menu>
    </Touchable>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: CONNECTED_ACCOUNT_ITEM_HEIGHT,
    marginBottom: 1,
    overflow: 'hidden',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarWhiteBg: {
    backgroundColor: '#FFFFFF',
  },
  avatarDefaultBg: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameLabel: {
    flexShrink: 1,
  },
  statusIcon: {
    marginLeft: 6,
  },
});

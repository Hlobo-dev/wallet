import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState/EmptyState';
import { Label } from '@/components/Label';
import { SvgIcon } from '@/components/SvgIcon';
import { useTheme } from '@/theme/themes';

interface BrokerageEmptyPositionsProps {
  onConnect?: () => void;
}

export const BrokerageEmptyPositions = ({ onConnect }: BrokerageEmptyPositionsProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <EmptyState description="No positions yet. Connect a brokerage to track and trade from your wallet." />
      {onConnect && (
        <TouchableOpacity style={[styles.connectButton, { backgroundColor: colors.purple_40 }]} onPress={onConnect} activeOpacity={0.7}>
          <SvgIcon name="plug-connected" size={16} color="light100" />
          <Label type="boldCaption1" color="light100">
            Connect Brokerage
          </Label>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 48,
    marginTop: 12,
  },
});

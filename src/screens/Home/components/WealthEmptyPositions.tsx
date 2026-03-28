import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState/EmptyState';

export const WealthEmptyPositions = () => {
  return (
    <View style={styles.container}>
      <EmptyState description="No positions yet. Connect a wealth account to track your investments." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    marginBottom: 16,
  },
});

import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState/EmptyState';

export const BrokerageEmptyPositions = () => {
  return (
    <View style={styles.container}>
      <EmptyState description="No positions yet. Connect a brokerage to track and trade from your wallet." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    marginBottom: 16,
  },
});

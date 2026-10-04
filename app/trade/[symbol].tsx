import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder order-ticket modal route. Order entry arrives in the trading spec.
export default function TradeScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header">Trade {symbol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

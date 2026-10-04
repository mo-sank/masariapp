import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder stock detail route. Charts and quotes arrive in the trading spec.
export default function StockScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header">{symbol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

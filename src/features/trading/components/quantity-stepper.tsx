/**
 * QuantityStepper (requirement 8.1).
 *
 * A whole-shares stepper for the order ticket: a minus button, the current
 * quantity, and a plus button. Shares are integer-only and never drop below the
 * `min` (1), so a learner cannot submit a zero- or fractional-share order. The
 * control is purely presentational — it reports the next value through
 * `onChange` and leaves state to the ticket.
 */
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface QuantityStepperProps {
  /** Current whole-share quantity. */
  value: number;
  /** Called with the next quantity when the learner steps up or down. */
  onChange: (next: number) => void;
  /** Smallest allowed quantity. Defaults to 1 (no zero/fractional shares). */
  min?: number;
  /** Disable both buttons (e.g. while an order is in flight). */
  disabled?: boolean;
}

export function QuantityStepper({ value, onChange, min = 1, disabled = false }: QuantityStepperProps) {
  const theme = useTheme();
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(value + 1);
  const atMin = value <= min;

  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <Button
        title="−"
        variant="secondary"
        onPress={decrement}
        disabled={disabled || atMin}
        accessibilityLabel="Decrease quantity"
      />
      <Text
        variant="title"
        color="text"
        accessibilityLabel={`Quantity ${value} ${value === 1 ? 'share' : 'shares'}`}
        style={styles.value}
      >
        {value}
      </Text>
      <Button
        title="+"
        variant="secondary"
        onPress={increment}
        disabled={disabled}
        accessibilityLabel="Increase quantity"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 48,
    textAlign: 'center',
  },
});

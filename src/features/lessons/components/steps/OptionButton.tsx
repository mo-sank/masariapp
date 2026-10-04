/**
 * Selectable answer option (requirement 4.8).
 *
 * A single tappable choice shared by {@link McqStep} and {@link TrueFalseStep}:
 * a themed row that shows its label and reflects whether it is the learner's
 * current selection. It is intentionally dumb — it reports a press and paints a
 * selected/unselected surface — so the step components own the answer logic and
 * stay pure (requirement 4.8).
 *
 * Accessibility (requirement 4.8): exposes the `radio` role with its checked
 * state via `accessibilityState.selected`, and reports its position in the group
 * (`positionInSet` / `setSize`) so assistive tech can announce "2 of 4". The row
 * keeps a comfortable minimum tap target.
 */

import { Pressable, StyleSheet } from 'react-native';

import { Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';

export interface OptionButtonProps {
  /** The option text shown to the learner and used as the accessibility label. */
  label: string;
  /** Whether this option is the learner's current selection. */
  selected: boolean;
  /** 1-based position of this option within its group (for assistive tech). */
  positionInSet: number;
  /** Total number of options in the group (for assistive tech). */
  setSize: number;
  /** Report a tap. The parent decides what selecting means. */
  onPress: () => void;
}

export function OptionButton({
  label,
  selected,
  positionInSet,
  setSize,
  onPress,
}: OptionButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      // Position-in-set helps VoiceOver/TalkBack announce "N of M".
      aria-posinset={positionInSet}
      aria-setsize={setSize}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          // A selected option gets a tinted border weight; the fill stays the
          // surface color so text contrast is unaffected (requirement 10.4).
          borderWidth: selected ? 2 : 1,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.md - 2,
          paddingHorizontal: theme.spacing.md,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="body" color={selected ? 'primary' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    minHeight: 48, // comfortable tap target (>= 44pt)
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});

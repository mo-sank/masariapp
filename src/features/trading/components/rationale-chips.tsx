/**
 * RationaleChips (requirement 9.1).
 *
 * The reason picker shown on a buy once `pre_trade_rationale` is unlocked: a
 * row of toggleable reason chips plus an optional free-text note capped at 280
 * characters. The ticket requires at least one chip before the order can be
 * placed (enforced in order-ticket-logic.ts); this component only renders the
 * chips and note and reports selection changes upward.
 *
 * Each chip is an accessible toggle (role `button`, `selected` state) so a
 * screen reader announces which reasons are chosen. The note's remaining-
 * character count is shown so the learner can see the 280-char limit; the input
 * itself also hard-caps length via `maxLength`.
 */
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { RATIONALE_CHIPS, RATIONALE_NOTE_MAX } from '../order-ticket-logic';

export interface RationaleChipsProps {
  /** Currently selected chip ids. */
  selectedTags: string[];
  /** Called with the next selected ids when a chip is toggled. */
  onChangeTags: (next: string[]) => void;
  /** Current note text. */
  note: string;
  /** Called with the next note text as the learner types. */
  onChangeNote: (next: string) => void;
  /** Disable all inputs (e.g. while an order is in flight). */
  disabled?: boolean;
}

export function RationaleChips({
  selectedTags,
  onChangeTags,
  note,
  onChangeNote,
  disabled = false,
}: RationaleChipsProps) {
  const theme = useTheme();

  const toggle = (id: string) => {
    if (selectedTags.includes(id)) {
      onChangeTags(selectedTags.filter((t) => t !== id));
    } else {
      onChangeTags([...selectedTags, id]);
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="body" color="text">
        Why this trade? Pick at least one.
      </Text>

      <View style={[styles.chips, { gap: theme.spacing.sm }]}>
        {RATIONALE_CHIPS.map((chip) => {
          const selected = selectedTags.includes(chip.id);
          return (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={chip.label}
              disabled={disabled}
              onPress={() => toggle(chip.id)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                  borderRadius: theme.radii.md,
                  paddingVertical: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                },
                disabled && styles.disabled,
              ]}
            >
              <Text variant="caption" color={selected ? 'onPrimary' : 'text'}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        accessibilityLabel="Optional note about why you are making this trade"
        placeholder="Add a note (optional)"
        placeholderTextColor={theme.colors.textMuted}
        value={note}
        onChangeText={onChangeNote}
        editable={!disabled}
        multiline
        maxLength={RATIONALE_NOTE_MAX}
        style={[
          styles.note,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.sm,
            padding: theme.spacing.md,
          },
        ]}
      />
      <Text variant="caption" color="textMuted">
        {`${RATIONALE_NOTE_MAX - note.length} characters left`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  note: {
    borderWidth: 1,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  disabled: {
    opacity: 0.5,
  },
});

/**
 * ReflectionSheet (requirements 9.2, 9.3).
 *
 * The prompt shown after a sell fills, once `post_trade_reflection` is
 * unlocked: "Did it go better, as expected, or worse?" with the three choices
 * and an optional note, calling `submit_reflection` through
 * {@link useSubmitReflection}. The learner can also skip it — a reflection is
 * encouraged, not required.
 *
 * The note is private to the user (requirement 9.3): it is sent to the
 * owner-scoped RPC and only ever read back through the caller's RLS-scoped
 * reflections, never shown on any shared screen.
 *
 * On success the sheet calls `onDone` so the ticket can close. On failure it
 * stays open and shows friendly copy mapped from the server error code.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import {
  REFLECTION_CHOICES,
  REFLECTION_NOTE_MAX,
  isReflectionComplete,
  type ReflectionExpectation,
} from '../reflection-logic';
import { mapReflectionError, useSubmitReflection } from '../use-reflection';

export interface ReflectionSheetProps {
  /** The filled sell order to reflect on. */
  orderId: string;
  /** The symbol just sold, for the prompt copy. */
  symbol: string;
  /** Called once the learner submits a reflection or skips. */
  onDone: () => void;
}

export function ReflectionSheet({ orderId, symbol, onDone }: ReflectionSheetProps) {
  const theme = useTheme();
  const submit = useSubmitReflection();

  const [expectation, setExpectation] = useState<ReflectionExpectation | null>(null);
  const [note, setNote] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const canSubmit = isReflectionComplete(expectation, note) && !submit.isPending;

  const onSubmit = () => {
    if (expectation == null) {
      return;
    }
    setErrorText(null);
    submit.mutate(
      { orderId, expectation, note: note.length > 0 ? note : null },
      {
        onSuccess: () => onDone(),
        onError: (error) => setErrorText(mapReflectionError(error)),
      },
    );
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="title" color="text" accessibilityRole="header">
        How did it go?
      </Text>

      <Text variant="body" color="textMuted">
        {`You sold ${symbol}. Did it go better, as expected, or worse than you thought?`}
      </Text>

      {/* The three expectation choices, each a toggle. */}
      <View style={[styles.choices, { gap: theme.spacing.md }]}>
        {REFLECTION_CHOICES.map((choice) => {
          const selected = expectation === choice.id;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: submit.isPending }}
              accessibilityLabel={choice.label}
              disabled={submit.isPending}
              onPress={() => setExpectation(choice.id)}
              style={[
                styles.choice,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                  borderRadius: theme.radii.md,
                  paddingVertical: theme.spacing.md,
                  paddingHorizontal: theme.spacing.lg,
                },
                submit.isPending && styles.disabled,
              ]}
            >
              <Text variant="body" color={selected ? 'onPrimary' : 'text'}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Optional private note. */}
      <Card style={{ gap: theme.spacing.sm }}>
        <TextInput
          accessibilityLabel="Optional note about how the trade went (private to you)"
          placeholder="Add a note (optional, private to you)"
          placeholderTextColor={theme.colors.textMuted}
          value={note}
          onChangeText={setNote}
          editable={!submit.isPending}
          multiline
          maxLength={REFLECTION_NOTE_MAX}
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
          {`${REFLECTION_NOTE_MAX - note.length} characters left · Only you can see this.`}
        </Text>
      </Card>

      {/* Error: keep the sheet open and show friendly copy. */}
      {errorText ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[
            styles.error,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.danger,
              borderRadius: theme.radii.sm,
              padding: theme.spacing.md,
            },
          ]}
        >
          <Text variant="body" color="danger">
            {errorText}
          </Text>
        </View>
      ) : null}

      <Button
        title="Save reflection"
        onPress={onSubmit}
        loading={submit.isPending}
        disabled={!canSubmit}
        accessibilityLabel="Save reflection"
      />
      <Button
        title="Skip for now"
        variant="secondary"
        onPress={onDone}
        disabled={submit.isPending}
        accessibilityLabel="Skip reflection"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  choice: {
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  note: {
    borderWidth: 1,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  error: {
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});

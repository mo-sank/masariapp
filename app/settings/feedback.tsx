import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Screen, Text, useToast } from '../../src/components/ui';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
  isFeedbackSubmittable,
  type FeedbackCategory,
} from '../../src/features/feedback/feedback-logic';
import { mapFeedbackError, useSubmitFeedback } from '../../src/features/feedback/use-feedback';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Settings > Send feedback (requirements 5.1, 5.2, 5.3).
 *
 * The form a beta tester fills in to send feedback from inside the app
 * (requirement 5.1): a category (one of four chips), a message of up to 1000
 * characters, and the name of the screen they were on — passed in as the `from`
 * param by whoever opened this screen (Settings today), so the team can see
 * where the feedback came from. The submission goes through
 * {@link useSubmitFeedback} -> the `submit_feedback` RPC, which stores the row
 * for the current user only (requirement 5.3 — feedback is private to its
 * author via RLS, readable by the team through the dashboard).
 *
 * The server enforces a per-user daily limit (requirement 5.2). When it's hit
 * the RPC returns `rate_limited`; the screen keeps the typed message (so nothing
 * is lost — the design's "feedback errors keep the typed message") and shows the
 * friendly limit copy from {@link mapFeedbackError} rather than a raw code.
 *
 * The screen stays thin: category/limit rules and error mapping live in the
 * feedback feature; this route owns only the form state and layout. On success
 * it shows a toast and returns to Settings.
 */
export default function FeedbackScreen() {
  const theme = useTheme();
  const toast = useToast();
  const submit = useSubmitFeedback();

  // The screen the user was on before opening feedback (requirement 5.1).
  // Passed by the opener; defaults to 'settings' when absent.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const screenName = typeof from === 'string' && from.length > 0 ? from : 'settings';

  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const canSubmit = isFeedbackSubmittable(category, message) && !submit.isPending;
  const charsLeft = FEEDBACK_MESSAGE_MAX - message.length;

  const onSubmit = () => {
    if (category == null) {
      return;
    }
    setErrorText(null);
    submit.mutate(
      { category, message: message.trim(), screen: screenName },
      {
        onSuccess: () => {
          toast.show('Thanks for the feedback!');
          router.back();
        },
        // Keep the typed message so nothing is lost; show friendly copy.
        onError: (error) => setErrorText(mapFeedbackError(error)),
      },
    );
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Send feedback
      </Text>

      <Text variant="body" color="textMuted">
        Found a bug, have an idea, or hit something confusing? Tell us — it helps us make Masari
        better.
      </Text>

      {/* Category chips. */}
      <View accessibilityRole="radiogroup" style={[styles.choices, { gap: theme.spacing.md }]}>
        {FEEDBACK_CATEGORIES.map((choice) => {
          const selected = category === choice.id;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: submit.isPending }}
              accessibilityLabel={choice.label}
              disabled={submit.isPending}
              onPress={() => setCategory(choice.id)}
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

      {/* Message. */}
      <Card style={{ gap: theme.spacing.sm }}>
        <TextInput
          accessibilityLabel="Your feedback message"
          placeholder="What happened, or what would you change?"
          placeholderTextColor={theme.colors.textMuted}
          value={message}
          onChangeText={setMessage}
          editable={!submit.isPending}
          multiline
          maxLength={FEEDBACK_MESSAGE_MAX}
          style={[
            styles.message,
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
          {`${charsLeft} characters left`}
        </Text>
      </Card>

      {/* Error: keep the typed message and show friendly copy. */}
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
        title="Send feedback"
        onPress={onSubmit}
        loading={submit.isPending}
        disabled={!canSubmit}
        accessibilityLabel="Send feedback"
      />
      <Button
        title="Cancel"
        variant="secondary"
        onPress={() => router.back()}
        disabled={submit.isPending}
        accessibilityLabel="Cancel and go back"
      />
    </Screen>
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
  message: {
    borderWidth: 1,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  error: {
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});

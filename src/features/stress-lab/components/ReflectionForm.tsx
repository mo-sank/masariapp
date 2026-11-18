/**
 * ReflectionForm (FR-34, Phase 2).
 *
 * Shown after a run: a few open questions the student answers to capture what
 * they learned ("what surprised you?", "what would you change?"). Answers save
 * through `save_reflection` and reload on return, so a student can revisit a
 * past run and see their own notes. Answers are private to the student.
 *
 * Presentational and controlled by the parent: the parent owns the answer map
 * and the save action, seeding it from the reloaded reflection. This form only
 * renders the questions and reports edits.
 */
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

/** A reflection question the student answers. */
export interface ReflectionQuestion {
  /** Stable id, persisted with the answer. */
  id: string;
  /** The prompt shown to the student. */
  prompt: string;
}

/** The default reflection prompts (overridable by the parent). */
export const DEFAULT_REFLECTION_QUESTIONS: readonly ReflectionQuestion[] = [
  { id: 'surprise', prompt: 'What surprised you about the result?' },
  { id: 'weakness', prompt: 'Where did your portfolio look weakest?' },
  { id: 'change', prompt: 'What would you change before running it again?' },
];

/** Max characters per answer (matches the server-side clamp). */
export const REFLECTION_ANSWER_MAX = 280;

export interface ReflectionFormProps {
  /** The questions to show. Defaults to {@link DEFAULT_REFLECTION_QUESTIONS}. */
  questions?: readonly ReflectionQuestion[];
  /** Current answers keyed by question id. */
  answers: Record<string, string>;
  /** Report an answer edit. */
  onChangeAnswer: (questionId: string, answer: string) => void;
  /** Save the reflection. */
  onSubmit: () => void;
  /** True while the save is pending. */
  isSaving: boolean;
  /** True once a reflection has been saved (shows the saved hint). */
  saved: boolean;
}

export function ReflectionForm({
  questions = DEFAULT_REFLECTION_QUESTIONS,
  answers,
  onChangeAnswer,
  onSubmit,
  isSaving,
  saved,
}: ReflectionFormProps) {
  const theme = useTheme();
  const hasAnyAnswer = questions.some((q) => (answers[q.id] ?? '').trim().length > 0);
  const canSubmit = hasAnyAnswer && !isSaving;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Reflect on what you learned
      </Text>

      {questions.map((q) => {
        const answer = answers[q.id] ?? '';
        return (
          <View key={q.id} style={{ gap: theme.spacing.xs }}>
            <Text variant="body" color="text">
              {q.prompt}
            </Text>
            <TextInput
              accessibilityLabel={q.prompt}
              placeholder="Your answer (private to you)"
              placeholderTextColor={theme.colors.textMuted}
              value={answer}
              onChangeText={(text) => onChangeAnswer(q.id, text)}
              editable={!isSaving}
              multiline
              maxLength={REFLECTION_ANSWER_MAX}
              style={[
                styles.answer,
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
              {`${REFLECTION_ANSWER_MAX - answer.length} characters left · Only you can see this.`}
            </Text>
          </View>
        );
      })}

      <Button
        title="Save reflection"
        variant="primary"
        onPress={onSubmit}
        loading={isSaving}
        disabled={!canSubmit}
        accessibilityLabel="Save reflection"
      />
      {saved ? (
        <Text variant="caption" color="primary">
          Saved. Your reflection will be here when you come back.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  answer: {
    borderWidth: 1,
    minHeight: 64,
    textAlignVertical: 'top',
  },
});

/**
 * Rewind session view (requirements 7.3, 7.4, 10.1).
 *
 * Walks the learner through the due missed items one at a time, re-presenting
 * each item's authored step through the same {@link StepRenderer} registry the
 * lesson player uses (so a re-asked question looks exactly like the original),
 * grades the re-answer with the shared pure scorer, and reports the result up so
 * the route can call `review_rewind_item` (requirement 7.4). After the last item
 * it shows a short summary (how many reviewed, how many correct) and reports the
 * session as complete so the route can log analytics and refresh the queue.
 *
 * It mirrors the {@link LessonPlayer} shell but is intentionally smaller: there
 * is no exit confirmation (a Rewind session is ~90 seconds and losing it costs
 * nothing — the items are still due), no XP, and no completion RPC. On each
 * scored answer it records correctness, fires the same light reduce-motion-aware
 * haptic (requirement 3.4), and shows the {@link FeedbackSheet} verdict +
 * explanation before advancing (requirement 3.2 applies to the re-ask too).
 *
 * The component owns only transient view state (which item, the current feedback,
 * the running correct count). Grading is delegated to the pure
 * {@link gradeReviewAnswer}; the RPC call, navigation, analytics and query
 * invalidation live in the route via the `onReview` / `onComplete` callbacks, so
 * this view stays easy to drive from both the app and tests.
 *
 * Accessibility: a progress caption ("Item N of M") is a header; the feedback
 * sheet carries the alert role it always has. Every item is remounted by key so
 * a step component never carries state across items.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FeedbackSheet } from './FeedbackSheet';
import { ProgressBar } from './ProgressBar';
import { StepRenderer } from './steps/registry';
import { Button, Card, Screen, Text } from '../../../components/ui';
import { useReduceMotion } from '../../../theme/use-reduce-motion';
import { useTheme } from '../../../theme/theme-provider';
import { feedbackHaptic } from '../haptics';
import { gradeReviewAnswer, type ReviewItem } from '../rewind-session';
import type { Step } from '../schema';
import type { Answer } from '../scoring';

export interface RewindSessionProps {
  /** The resolved items to review (from `buildReviewItems`), in order. */
  items: ReviewItem[];
  /**
   * Report a single reviewed item's result so the route can call
   * `review_rewind_item` (requirement 7.4). Fire-and-forget from this view's
   * perspective — it advances regardless of whether the RPC succeeds.
   */
  onReview: (itemId: string, correct: boolean) => void;
  /**
   * Report the finished session: how many items were reviewed and how many were
   * correct. The route logs `rewind_session_completed` and refreshes the queue.
   */
  onComplete: (summary: { reviewed: number; correct: number }) => void;
  /** Leave the session (the summary's primary action, and the empty state). */
  onDone: () => void;
}

/** The short explanation to show in the feedback sheet for a reviewed step. */
function explanationFor(step: Step): string {
  switch (step.type) {
    case 'mcq':
    case 'truefalse':
    case 'sort':
    case 'match':
      return step.explanation;
    case 'predict':
      return step.reveal;
    default:
      return '';
  }
}

export function RewindSession({ items, onReview, onComplete, onDone }: RewindSessionProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string } | null>(null);
  // Running correct count kept in state so the summary reads it without touching
  // a ref during render; `pendingCorrect` holds the just-answered result until
  // the learner advances, so the count updates exactly once per item.
  const [correctCount, setCorrectCount] = useState(0);
  const [pendingCorrect, setPendingCorrect] = useState<boolean | null>(null);
  // The finished-session summary; non-null means the session is done.
  const [summary, setSummary] = useState<{ reviewed: number; correct: number } | null>(null);

  const total = items.length;
  const current = items[Math.min(index, Math.max(total - 1, 0))];

  // Record a reviewed answer: grade it, report it, show feedback + haptic.
  const handleAnswer = useCallback(
    (answer: Answer) => {
      if (!current) {
        return;
      }
      const correct = gradeReviewAnswer(current.step, answer);
      setPendingCorrect(correct);
      onReview(current.itemId, correct);
      feedbackHaptic(correct, reduceMotion);
      setFeedback({ correct, explanation: explanationFor(current.step) });
    },
    [current, onReview, reduceMotion],
  );

  // Dismiss the feedback sheet and advance; finishing after the last item.
  const handleContinue = useCallback(() => {
    setFeedback(null);
    // Fold the just-answered result into the running count.
    const newCorrect = correctCount + (pendingCorrect === true ? 1 : 0);
    setCorrectCount(newCorrect);
    setPendingCorrect(null);

    const isLast = index >= total - 1;
    if (isLast) {
      setSummary({ reviewed: total, correct: newCorrect });
      onComplete({ reviewed: total, correct: newCorrect });
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, total, onComplete, correctCount, pendingCorrect]);

  // Empty session (nothing resolved to a renderable step): a gentle message and
  // a way back. The card only routes here when there are due items, but content
  // can change, so handle an empty resolved list rather than render nothing.
  if (total === 0) {
    return (
      <Screen center style={{ gap: theme.spacing.lg }}>
        <Text variant="title" accessibilityRole="header">
          Nothing to review
        </Text>
        <Text variant="body" color="textMuted">
          You are all caught up. Great work!
        </Text>
        <Button
          title="Back to learning"
          variant="primary"
          onPress={onDone}
          accessibilityLabel="Back to learning"
        />
      </Screen>
    );
  }

  // Summary screen after the last item (requirement 7.3's short session wrap-up).
  if (summary) {
    const { reviewed, correct } = summary;
    return (
      <Screen scroll center style={{ gap: theme.spacing.lg }}>
        <Text variant="title" accessibilityRole="header">
          Rewind complete
        </Text>
        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="title" accessibilityElementsHidden importantForAccessibility="no">
            🎯
          </Text>
          <Text
            variant="body"
            color="text"
            accessibilityLabel={`You reviewed ${reviewed} ${reviewed === 1 ? 'item' : 'items'} and got ${correct} right`}
          >
            {`You reviewed ${reviewed} ${reviewed === 1 ? 'item' : 'items'} and got ${correct} right.`}
          </Text>
          <Text variant="caption" color="textMuted">
            Items you missed will come back again; the ones you nailed will wait
            longer.
          </Text>
        </Card>
        <Button
          title="Back to learning"
          variant="primary"
          onPress={onDone}
          accessibilityLabel="Back to learning"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <View style={[styles.header, { gap: theme.spacing.sm }]}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          {`Item ${index + 1} of ${total}`}
        </Text>
        <ProgressBar stepIndex={index} totalSteps={total} reduceMotion={reduceMotion} />
      </View>

      <StepRenderer
        // Remount per item so a step component never carries state across items.
        key={current.itemId}
        step={current.step}
        onAnswer={handleAnswer}
        // An unscored step cannot be a missed scored item, so this should not be
        // reached; advance safely if a non-scored step ever resolves here.
        onContinue={handleContinue}
      />

      <FeedbackSheet
        visible={feedback != null}
        correct={feedback?.correct ?? false}
        explanation={feedback?.explanation ?? ''}
        continueLabel={index >= total - 1 ? 'Finish' : 'Continue'}
        onContinue={handleContinue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
  },
});

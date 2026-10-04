/**
 * Lesson player shell (requirements 3.1, 3.2, 3.3, 3.4, 10.1).
 *
 * The screen that drives a lesson run. Given a parsed `lesson` it:
 *   - shows a progress bar and presents steps one at a time (3.1), rendering the
 *     current step through the {@link StepRenderer} registry;
 *   - on a scored answer, records it in the session store, then shows the
 *     {@link FeedbackSheet} with an immediate correct/incorrect verdict and the
 *     step's explanation before advancing (3.2), and fires a light haptic that
 *     respects reduce-motion (3.4);
 *   - on an unscored step, advances straight to the next step;
 *   - lets the learner exit with a confirmation dialog (3.3); the session store
 *     keeps the step and answers so reopening the same lesson resumes in place;
 *   - when the last step is done, reports the result to `onComplete`.
 *
 * The player owns no durable state: progress lives in the Zustand session store
 * (so resume-in-session works) and the final result is handed to the caller via
 * `onComplete` (the completion flow / results screen arrive in task 11). The
 * route (`app/lesson/[id].tsx`) owns navigation and starts/resumes the session;
 * the player assumes a session for `lesson.id` is already active.
 *
 * Analytics (10.1): the route logs `lesson_started`; the player logs
 * `step_answered` (with correctness) for each scored answer and `lesson_completed`
 * (with the actual duration) when the run finishes.
 *
 * Reduce-motion (10.1): the progress bar snaps instead of animating when the OS
 * setting is on, and the feedback haptic is skipped (handled in `feedbackHaptic`).
 */

import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExitConfirm } from './ExitConfirm';
import { FeedbackSheet } from './FeedbackSheet';
import { ProgressBar } from './ProgressBar';
import { StepRenderer } from './steps/registry';
import { Button, Screen } from '../../../components/ui';
import { useReduceMotion } from '../../../theme/use-reduce-motion';
import { useTheme } from '../../../theme/theme-provider';
import { trackLessonCompleted, trackStepAnswered } from '../analytics';
import { feedbackHaptic } from '../haptics';
import type { Lesson, Step } from '../schema';
import { scoreLesson, type Answer, type LessonScore } from '../scoring';
import { useSessionStore } from '../store/session';

export interface LessonPlayerProps {
  /** The lesson being played. A session for `lesson.id` must already be active. */
  lesson: Lesson;
  /** Called when the learner confirms leaving mid-lesson (route navigates away). */
  onExit: () => void;
  /**
   * Called once when the run reaches the end, with the computed score and the
   * run's actual duration in ms. The completion flow (task 11) sends this to
   * `complete_lesson` and shows the results screen.
   */
  onComplete: (result: { score: LessonScore; durationMs: number }) => void;
}

/** The short explanation to show in the feedback sheet for an answered step. */
function explanationFor(step: Step): string {
  switch (step.type) {
    case 'mcq':
    case 'truefalse':
    case 'sort':
    case 'match':
      return step.explanation;
    case 'predict':
      return step.reveal;
    // sim/cards/guided_trade don't carry a text explanation here.
    default:
      return '';
  }
}

/** Correctness of a single answer, reusing the pure scorer on a one-step lesson. */
function isAnswerCorrect(step: Step, answer: Answer): boolean {
  return scoreLesson([step], [answer]).perItem[0]?.correct ?? false;
}

export function LessonPlayer({ lesson, onExit, onComplete }: LessonPlayerProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  const stepIndex = useSessionStore((s) => s.stepIndex);
  const status = useSessionStore((s) => s.status);
  const recordAnswer = useSessionStore((s) => s.answer);
  const advance = useSessionStore((s) => s.next);
  const exitSession = useSessionStore((s) => s.exit);

  const totalSteps = lesson.steps.length;
  const step = lesson.steps[Math.min(stepIndex, totalSteps - 1)];

  // The Placement Quest must not reveal which answers were right or wrong, nor a
  // verdict/explanation per step (requirement 6.3). For a placement lesson the
  // feedback sheet shows a neutral "answer saved" acknowledgment instead.
  const revealFeedback = lesson.kind !== 'placement';

  // The verdict/explanation to show in the feedback sheet after a scored answer.
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [exitVisible, setExitVisible] = useState(false);

  // Finish the run: score every recorded answer and hand the result up. Reads
  // the store at call time so it always sees the latest answers / start time.
  const finish = useCallback(() => {
    const { answers, startedAt: start } = useSessionStore.getState();
    const score = scoreLesson(lesson.steps, answers);
    const durationMs = start != null ? Date.now() - start : 0;
    trackLessonCompleted(lesson.id, score.scorePct, durationMs);
    onComplete({ score, durationMs });
  }, [lesson, onComplete]);

  // A scored step reported an answer: record it, show feedback + haptic, log it.
  const handleAnswer = useCallback(
    (answer: Answer) => {
      const correct = isAnswerCorrect(step, answer);
      recordAnswer(answer);
      trackStepAnswered(lesson.id, step.id, correct);
      feedbackHaptic(correct, reduceMotion);
      setFeedback({ correct, explanation: explanationFor(step) });
    },
    [step, recordAnswer, lesson.id, reduceMotion],
  );

  // Advance from the current step (last step -> finish, else next step).
  const goNext = useCallback(() => {
    const isLast = stepIndex >= totalSteps - 1;
    advance(totalSteps);
    if (isLast) {
      finish();
    }
  }, [stepIndex, totalSteps, advance, finish]);

  // Dismiss the feedback sheet, then advance.
  const handleFeedbackContinue = useCallback(() => {
    setFeedback(null);
    goNext();
  }, [goNext]);

  // Confirm exit: clear the session and let the route navigate away.
  const handleExitConfirm = useCallback(() => {
    setExitVisible(false);
    exitSession();
    onExit();
  }, [exitSession, onExit]);

  const header = useMemo(
    () => (
      <View style={[styles.header, { gap: theme.spacing.md }]}>
        <Button
          title="Exit"
          variant="secondary"
          onPress={() => setExitVisible(true)}
          accessibilityLabel="Exit the lesson"
        />
        <ProgressBar stepIndex={stepIndex} totalSteps={totalSteps} reduceMotion={reduceMotion} />
      </View>
    ),
    [theme.spacing.md, stepIndex, totalSteps, reduceMotion],
  );

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      {header}

      <StepRenderer
        // Remount per step so a step component never carries state across steps.
        key={step.id}
        step={step}
        onAnswer={handleAnswer}
        onContinue={goNext}
      />

      <FeedbackSheet
        visible={status === 'feedback' && feedback != null}
        correct={feedback?.correct ?? false}
        explanation={feedback?.explanation ?? ''}
        reveal={revealFeedback}
        continueLabel={stepIndex >= totalSteps - 1 ? 'Finish' : 'Continue'}
        onContinue={handleFeedbackContinue}
      />

      <ExitConfirm
        visible={exitVisible}
        onCancel={() => setExitVisible(false)}
        onConfirm={handleExitConfirm}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
  },
});

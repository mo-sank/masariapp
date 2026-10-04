import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { Screen, StateView, useToast } from '../../src/components/ui';
import { buildRewindItems } from '../../src/features/lessons/api/save-rewind-items';
import { buildItemResults } from '../../src/features/lessons/api/submit-assessment';
import { trackLessonStarted } from '../../src/features/lessons/analytics';
import { LessonPlayer } from '../../src/features/lessons/components/LessonPlayer';
import { useCompletionResultStore } from '../../src/features/lessons/completion-result-store';
import { getLesson } from '../../src/features/lessons/content';
import { useCompleteLesson } from '../../src/features/lessons/hooks/use-complete-lesson';
import { useSaveRewindItems } from '../../src/features/lessons/hooks/use-save-rewind-items';
import { useSubmitAssessment } from '../../src/features/lessons/hooks/use-submit-assessment';
import { usePlacementResultStore } from '../../src/features/lessons/placement-result-store';
import type { Lesson } from '../../src/features/lessons/schema';
import type { LessonScore } from '../../src/features/lessons/scoring';
import { useSessionStore } from '../../src/features/lessons/store/session';

/**
 * Lesson player route (requirements 3.1, 3.3, 7.1, 10.1).
 *
 * The screen behind `lesson/<id>`. It resolves the lesson id from the path,
 * loads the parsed lesson from the content loader, and either:
 *   - shows a themed "lesson not found" state when the id has no lesson
 *     (design: "Missing lesson id shows a 'lesson not found' state"), or
 *   - starts/resumes a session and renders the {@link LessonPlayer}.
 *
 * Resume-in-session (3.3): on mount it calls `resumeIfSameSession(id)`, which is
 * a no-op when the same lesson is already in progress (so reopening lands on the
 * same step and keeps the recorded answers) and starts a fresh session
 * otherwise. We log `lesson_started` (10.1) only on a *fresh* start, so a resume
 * does not double-count a run.
 *
 * Navigation lives here, not in the player (requirements 5.2, 5.3, 5.5): on exit
 * we go back; on completion we send the run to `complete_lesson` via
 * {@link useCompleteLesson}, then route to the results screen on a pass or the
 * retry screen on a sub-pass. The parsed outcome is staged in the
 * completion-result store (its nested shape does not round-trip through URL
 * params) and read back by the results/retry route. If the completion call
 * fails (offline / RPC error) the mutation has already queued it for retry, so
 * we tell the learner it was saved and return them to the path rather than show
 * a results screen we do not have (requirement 5.5).
 *
 * Rewind queue (requirement 7.1): after a successful (non-placement) completion
 * we save the run's missed scored items through {@link useSaveRewindItems} so
 * they come back later as practice. This is best-effort and fire-and-forget —
 * never awaited and never allowed to affect the results screen — because a
 * missed item is not progress the learner would notice losing.
 *
 * Placement Quest (requirements 6.2, 6.3, 6.4): a `kind: 'placement'` lesson
 * (L0) takes a different ending. It has no pass/fail and awards no XP, so it must
 * not be shown through the scored results/retry screens. Instead we record the
 * diagnostic baseline through `submit_assessment` (via {@link useSubmitAssessment})
 * AND complete the node through `complete_lesson` (so L0 is marked done and its
 * unlock granted — design "Completion flow": "L0 additionally calls
 * submit_assessment"), then route to the no-reveal placement results screen.
 */
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = id ? getLesson(id) : undefined;


  const resumeIfSameSession = useSessionStore((s) => s.resumeIfSameSession);
  const exitSession = useSessionStore((s) => s.exit);
  const stageOutcome = useCompletionResultStore((s) => s.set);
  const stagePlacement = usePlacementResultStore((s) => s.set);
  const completeLesson = useCompleteLesson();
  const submitAssessment = useSubmitAssessment();
  const saveRewindItems = useSaveRewindItems();
  const toast = useToast();

  // Start or resume the session once per mount, logging lesson_started only when
  // a fresh session actually begins. A ref guards against double-invocation.
  const started = useRef(false);
  useEffect(() => {
    if (!lesson || started.current) {
      return;
    }
    started.current = true;

    // Determine whether this will be a fresh start before resuming: it is fresh
    // when no session is active or a different lesson is in progress.
    const before = useSessionStore.getState();
    const isFreshStart = before.status === 'idle' || before.lessonId !== lesson.id;

    resumeIfSameSession(lesson.id);

    if (isFreshStart) {
      trackLessonStarted(lesson.id);
    }
  }, [lesson, resumeIfSameSession]);

  if (!lesson) {
    return (
      <Screen center>
        <StateView
          kind="error"
          title="Lesson not found"
          message="We couldn't find that lesson. It may have been moved or removed."
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const handlePlacementComplete = async (completed: Lesson, score: LessonScore) => {
    // Placement (6.2/6.3/6.4): record the diagnostic baseline through
    // submit_assessment and complete the node through complete_lesson. Build the
    // per-item results (item_id, concept, correct) from the scored breakdown; the
    // server computes and stores the score — it is never shown (no reveal).
    try {
      await submitAssessment.mutateAsync({
        lessonId: completed.id,
        form: 'A',
        itemResults: buildItemResults(score.perItem),
      });

      // Also complete the lesson so L0 is marked done and its unlock granted.
      // L0's passScore is 0 and xp is 0, so this always "passes" with no XP.
      const completion = await completeLesson.mutateAsync({
        lessonId: completed.id,
        scorePct: score.scorePct,
        durationMs: 0,
        answers: score.perItem.map((item) => ({
          stepId: item.stepId,
          concept: item.concept,
          correct: item.correct,
        })),
      });

      stagePlacement({
        lessonId: completed.id,
        lessonTitle: completed.title,
        unlocked: completion.passed ? completion.unlocked : [],
      });
      exitSession();
      router.replace('/lesson/placement');
    } catch (err) {
      // Best-effort baseline (6.4): if either call fails, don't block the learner.
      // complete_lesson's failure is already queued for retry by its mutation.
      console.error('[placement] completion failed:', (err as Error)?.message ?? err);
      exitSession();
      toast.show('Saved — we will sync your progress when you are back online.');
      router.replace('/(tabs)/learn');
    }
  };

  const handleComplete = async ({
    score,
    durationMs,
  }: {
    score: LessonScore;
    durationMs: number;
  }) => {
    // The lesson id is guaranteed here (we returned early above when absent).
    const completed = lesson;

    // Placement quests end through the assessment flow, not scored completion.
    if (completed.kind === 'placement') {
      await handlePlacementComplete(completed, score);
      return;
    }

    try {
      const result = await completeLesson.mutateAsync({
        lessonId: completed.id,
        scorePct: score.scorePct,
        durationMs,
        // Send only concept + correctness per scored item (no free text / PII).
        answers: score.perItem.map((item) => ({
          stepId: item.stepId,
          concept: item.concept,
          correct: item.correct,
        })),
      });

      // Queue this run's missed scored items for later practice (requirement
      // 7.1). Best-effort and non-blocking: a failure just means these misses
      // don't re-surface, so we never await it or let it affect the results
      // screen. buildRewindItems keeps only the incorrect scored items, so a
      // clean run sends nothing and the mutation short-circuits.
      const missed = buildRewindItems(score.perItem, completed.id);
      if (missed.length > 0) {
        saveRewindItems.mutate(missed);
      }

      // Stage the outcome for the results/retry screen, then clear the session
      // so leaving the completion screen does not resume a finished run.
      stageOutcome({
        lessonId: completed.id,
        lessonTitle: completed.title,
        passScore: completed.passScore,
        scorePct: score.scorePct,
        result,
      });
      exitSession();

      // Pass -> results; sub-pass -> encouraging retry (requirement 5.3).
      router.replace(result.passed ? '/lesson/results' : '/lesson/retry');
    } catch {
      // The mutation already queued the completion for retry (requirement 5.5);
      // reassure the learner and send them back to the path.
      exitSession();
      toast.show('Saved — we will sync your progress when you are back online.');
      router.replace('/(tabs)/learn');
    }
  };

  return (
    <LessonPlayer
      lesson={lesson}
      onExit={() => router.back()}
      onComplete={(result) => void handleComplete(result)}
    />
  );
}

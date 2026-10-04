import { router } from 'expo-router';

import { Screen, StateView } from '../../src/components/ui';
import { CompletionRetry } from '../../src/features/lessons/components/completion/CompletionRetry';
import { useCompletionResultStore } from '../../src/features/lessons/completion-result-store';

/**
 * Sub-pass retry route (requirement 5.3).
 *
 * The screen the lesson route sends the learner to when a score is below the
 * pass threshold. It reads the staged outcome from the completion-result store
 * and renders {@link CompletionRetry} with the lesson title, the score, and the
 * pass score.
 *
 * Navigation lives here: "Try again" clears the staged outcome and reopens the
 * lesson player (a fresh run), while "Back to path" clears it and returns to the
 * Learn tab. If the screen is reached without a staged sub-pass outcome, it shows
 * a neutral state and a route back rather than crashing.
 */
export default function LessonRetryScreen() {
  const outcome = useCompletionResultStore((s) => s.outcome);
  const clear = useCompletionResultStore((s) => s.clear);

  const goToPath = () => {
    clear();
    router.replace('/(tabs)/learn');
  };

  // No staged sub-pass outcome: nothing to show. Offer a route back to the path.
  if (!outcome || outcome.result.passed) {
    return (
      <Screen center>
        <StateView
          kind="empty"
          title="Nothing to show"
          message="Your lesson results are no longer available."
          onRetry={goToPath}
        />
      </Screen>
    );
  }

  return (
    <CompletionRetry
      lessonTitle={outcome.lessonTitle}
      scorePct={outcome.scorePct}
      passScore={outcome.passScore}
      onRetry={() => {
        const { lessonId } = outcome;
        clear();
        // Reopen the lesson for a fresh run.
        router.replace(`/lesson/${lessonId}`);
      }}
      onBackToPath={goToPath}
    />
  );
}

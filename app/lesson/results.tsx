import { router } from 'expo-router';

import { Screen, StateView } from '../../src/components/ui';
import { CompletionResults } from '../../src/features/lessons/components/completion/CompletionResults';
import { useCompletionResultStore } from '../../src/features/lessons/completion-result-store';

/**
 * Lesson results route (requirements 5.4, 5.6).
 *
 * The screen the lesson route sends the learner to after a passing completion.
 * It reads the staged outcome from the completion-result store (the lesson
 * screen put it there because the nested result does not round-trip through URL
 * params) and renders {@link CompletionResults}.
 *
 * Navigation lives here, not in the presentational component: "Back to path"
 * clears the staged outcome and returns to the Learn tab; "Go to feature" clears
 * it and routes to the unlocked feature. If the screen is reached without a
 * staged passing outcome (e.g. a hard reload or deep link), it shows a neutral
 * state and offers a way back rather than crashing.
 */
export default function LessonResultsScreen() {
  const outcome = useCompletionResultStore((s) => s.outcome);
  const clear = useCompletionResultStore((s) => s.clear);

  const goToPath = () => {
    clear();
    router.replace('/(tabs)/learn');
  };

  // No staged passing outcome: nothing to show. Offer a route back to the path.
  if (!outcome || !outcome.result.passed) {
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
    <CompletionResults
      result={outcome.result}
      lessonTitle={outcome.lessonTitle}
      onGoToFeature={(route) => {
        clear();
        // Route strings come from the vetted feature-routes map.
        router.replace(route as never);
      }}
      onBackToPath={goToPath}
    />
  );
}

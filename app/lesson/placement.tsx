import { router } from 'expo-router';

import { Screen, StateView } from '../../src/components/ui';
import { PlacementResults } from '../../src/features/lessons/components/completion/PlacementResults';
import { usePlacementResultStore } from '../../src/features/lessons/placement-result-store';

/**
 * Placement Quest results route (requirements 6.1, 6.3, 6.4).
 *
 * The screen the lesson route sends the learner to after finishing L0. It reads
 * the staged placement outcome from the placement-result store (the lesson
 * screen put it there because the unlocked list does not round-trip through URL
 * params) and renders {@link PlacementResults} — the no-reveal results view that
 * shows encouragement and the unlocked features, never a score or right/wrong
 * answers (requirement 6.3).
 *
 * Navigation lives here, not in the presentational component: "Start learning"
 * clears the staged outcome and returns to the Learn tab (where L0 is now
 * complete and the first lesson is available, requirement 6.1); "Go to feature"
 * clears it and routes to the unlocked feature. If reached without a staged
 * outcome (hard reload / deep link), it shows a neutral state and a route back
 * rather than crashing.
 */
export default function LessonPlacementScreen() {
  const outcome = usePlacementResultStore((s) => s.outcome);
  const clear = usePlacementResultStore((s) => s.clear);

  const goToPath = () => {
    clear();
    router.replace('/(tabs)/learn');
  };

  // No staged placement outcome: nothing to show. Offer a route back to the path.
  if (!outcome) {
    return (
      <Screen center>
        <StateView
          kind="empty"
          title="Nothing to show"
          message="Your placement results are no longer available."
          onRetry={goToPath}
        />
      </Screen>
    );
  }

  return (
    <PlacementResults
      lessonTitle={outcome.lessonTitle}
      unlocked={outcome.unlocked}
      onGoToFeature={(route) => {
        clear();
        // Route strings come from the vetted feature-routes map.
        router.replace(route as never);
      }}
      onStartLearning={goToPath}
    />
  );
}

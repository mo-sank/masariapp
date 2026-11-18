import { router, useLocalSearchParams } from 'expo-router';

import { Button, Disclaimer, Screen, StateView } from '../../../src/components/ui';
import { ComparisonDashboard } from '../../../src/features/stress-lab/components';
import { useSimulationsForScenario } from '../../../src/features/stress-lab/data';
import { getScenario } from '../../../src/features/stress-lab/scenarios/scenarios';
import { useSession } from '../../../src/lib/auth0';

/**
 * Comparison route (FR-35–FR-37).
 *
 * Reads the caller's runs of the scenario named by the `scenarioId` param
 * (newest-first, RLS-scoped) and compares the latest two: the earlier run is the
 * "original" baseline, the newest is the "updated" portfolio the student rebuilt
 * in the brokerage. Both come from persisted, immutable snapshots, so prior runs
 * are never overwritten.
 *
 * The route stays thin: it resolves the param and session, drives
 * loading/empty/error states via StateView, and hands the two rows to
 * ComparisonDashboard. All mapping and math live in src/features/stress-lab.
 */
export default function StressCompareScreen() {
  const { isSignedIn } = useSession();
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();

  const { data, isLoading, isError, refetch } = useSimulationsForScenario(scenarioId, isSignedIn);

  const scenarioName = scenarioId ? (getScenario(scenarioId)?.name ?? scenarioId) : '';

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your runs to compare. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  // Need at least two runs of the same scenario to compare.
  if (!data || data.length < 2) {
    return (
      <Screen scroll>
        <StateView
          kind="empty"
          title="Run it twice to compare"
          message="Change your portfolio in the brokerage, run this scenario again, and come back to see the before-and-after."
        />
        <Button
          title="Back to results"
          variant="primary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/stress-lab'))}
        />
      </Screen>
    );
  }

  // data[0] is newest (updated); data[1] is the prior run (original).
  const [updated, original] = data;

  return (
    <Screen scroll>
      <ComparisonDashboard original={original} updated={updated} scenarioName={scenarioName} />
      <Button
        title="Back to results"
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/stress-lab'))}
      />
      <Disclaimer />
    </Screen>
  );
}

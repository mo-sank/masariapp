import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, Disclaimer, Screen, StateView } from '../../../src/components/ui';
import {
  AssetBreakdownTable,
  ResultsSummary,
  RiskObservations,
  SectorExposure,
} from '../../../src/features/stress-lab/components';
import { simulationResultFromRow, useSimulation } from '../../../src/features/stress-lab/data';
import { getScenario } from '../../../src/features/stress-lab/scenarios/scenarios';
import { useSession } from '../../../src/lib/auth0';
import { useTheme } from '../../../src/theme/theme-provider';

/**
 * Stress test results dashboard (FR-20–FR-24, FR-8).
 *
 * Reads the persisted simulation named by the `simulationId` route param and
 * renders the results: overall performance, the start-vs-simulated comparison,
 * the per-holding table, sector exposure, and grounded risk observations — all
 * marked SIMULATED and visually distinct from the real overview. An "Improve My
 * Portfolio" action routes back to the brokerage so the student makes their own
 * changes (FR-8); it does not modify the portfolio.
 *
 * The route stays thin: it resolves the param and session, drives
 * loading/empty/error states via StateView, and maps the persisted row into the
 * engine's result shape with simulationResultFromRow — all math lives in
 * src/features/stress-lab.
 */
export default function StressResultsScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const { simulationId } = useLocalSearchParams<{ simulationId: string }>();

  const { data, isLoading, isError, refetch } = useSimulation(simulationId, isSignedIn);

  const result = useMemo(() => (data ? simulationResultFromRow(data) : null), [data]);
  const scenarioName = data ? (getScenario(data.scenario_id)?.name ?? data.scenario_id) : '';

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
          message="We couldn't load these results. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  if (!data || !result) {
    return (
      <Screen scroll style={{ gap: theme.spacing.lg }}>
        <StateView
          kind="empty"
          title="Results not found"
          message="We couldn't find this stress test. Run a new one from the Stress Lab."
        />
        <Button
          title="Back to the Stress Lab"
          variant="primary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/stress-lab'))}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <ResultsSummary result={result} scenarioName={scenarioName} />
      <AssetBreakdownTable holdings={result.holdings} />
      <SectorExposure result={result} />
      <RiskObservations result={result} />

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          title="Improve My Portfolio"
          variant="primary"
          onPress={() => router.push('/(tabs)/explore')}
          accessibilityLabel="Go to the market to improve your portfolio"
        />
        <Button
          title="Try another scenario"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/stress-lab'))}
        />
      </View>

      <Disclaimer />
    </Screen>
  );
}

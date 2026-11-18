import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Disclaimer, Screen, StateView, Text, useToast } from '../../src/components/ui';
import {
  HoldingsBreakdown,
  PortfolioOverview,
  ScenarioCard,
  ScenarioPreviewSheet,
} from '../../src/features/stress-lab/components';
import {
  mapStressError,
  useRunSimulation,
  useScenarios,
  useStressPortfolio,
  type LabScenario,
} from '../../src/features/stress-lab/data';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Portfolio Stress Lab entry screen (FR-1–FR-12).
 *
 * Shows the student's REAL paper portfolio overview at the top, then a list of
 * economic scenario cards. Tapping a card previews it; the preview's primary
 * action runs the stress test. The "Stress Test My Portfolio" action is DISABLED
 * while a run is pending and when there are no holdings (design-review NIT-2);
 * the simulation id is server-generated, so no client UUID is created here.
 *
 * A student with no holdings sees the FR-9 empty state with a button into the
 * Explore tab. This route stays thin: it owns navigation and loading/empty/error
 * states; all assembly and math live in src/features/stress-lab.
 */
export default function StressLabScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { isSignedIn } = useSession();

  const portfolio = useStressPortfolio(isSignedIn);
  const scenarios = useScenarios(isSignedIn);
  const run = useRunSimulation();

  const [preview, setPreview] = useState<LabScenario | null>(null);

  const isLoading = portfolio.isLoading || scenarios.isLoading;
  const isError = portfolio.isError || scenarios.isError;

  const refetch = () => {
    portfolio.refetch();
    void scenarios.refetch();
  };

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError || !portfolio.data || !scenarios.data) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load the Stress Lab. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const hasHoldings = portfolio.data.holdings.length > 0;

  // FR-9: no holdings means nothing to stress test — point the student to the
  // brokerage rather than letting them start a run.
  if (!hasHoldings) {
    return (
      <Screen scroll style={{ gap: theme.spacing.lg }}>
        <Text variant="title" accessibilityRole="header">
          Portfolio Stress Lab
        </Text>
        <StateView
          kind="empty"
          title="No holdings to test yet"
          message="Build a paper portfolio in the brokerage first, then come back to stress test it against real-world scenarios."
        />
        <Button
          title="Go to the market"
          variant="primary"
          onPress={() => router.push('/(tabs)/explore')}
        />
        <Disclaimer />
      </Screen>
    );
  }

  const runScenario = (scenario: LabScenario) => {
    run.mutate(
      { scenarioId: scenario.id },
      {
        onSuccess: (row) => {
          setPreview(null);
          router.push(`/stress-lab/results/${row.id}`);
        },
        onError: (error) => {
          toast.show(mapStressError(error), { tone: 'error' });
        },
      },
    );
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Portfolio Stress Lab
      </Text>

      <PortfolioOverview portfolio={portfolio.data} />
      <HoldingsBreakdown holdings={portfolio.data.holdings} />

      <View style={{ gap: theme.spacing.md }}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Pick a scenario to test
        </Text>
        {scenarios.data.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} onPress={() => setPreview(scenario)} />
        ))}
      </View>

      <Disclaimer />

      <ScenarioPreviewSheet
        scenario={preview}
        onRun={() => preview && runScenario(preview)}
        onClose={() => setPreview(null)}
        isRunning={run.isPending}
        canRun={hasHoldings}
      />
    </Screen>
  );
}

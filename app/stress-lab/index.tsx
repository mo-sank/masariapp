import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Disclaimer, Screen, StateView, Text, useToast } from '../../src/components/ui';
import {
  HoldingsBreakdown,
  PortfolioOverview,
  PredictionForm,
  ScenarioCard,
  ScenarioPreviewSheet,
  type PredictionDraft,
} from '../../src/features/stress-lab/components';
import {
  mapStressError,
  parsePredictionEstimateBp,
  useRunSimulation,
  useSavePrediction,
  useScenarios,
  useStressPortfolio,
  type LabScenario,
} from '../../src/features/stress-lab/data';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/** A fresh, empty prediction draft. */
const EMPTY_PREDICTION: PredictionDraft = {
  direction: null,
  estimatePercent: '',
  pickedBest: null,
  pickedWorst: null,
};

/**
 * Portfolio Stress Lab entry screen (FR-1–FR-12, FR-33).
 *
 * Shows the student's REAL paper portfolio overview at the top, then an optional
 * prediction (captured BEFORE running — "what do you think will happen?"), then
 * the economic scenario cards. Tapping a card previews it; the preview's primary
 * action runs the stress test. On a successful run any recorded prediction is
 * saved against the new simulation so the results screen can score it, then the
 * screen navigates to the results dashboard.
 *
 * The run action is DISABLED while pending and when there are no holdings
 * (design-review NIT-2); the simulation id is server-generated, so no client
 * UUID is created here. A student with no holdings sees the FR-9 empty state with
 * a button into the Explore tab. This route stays thin: navigation and
 * loading/empty/error states only; all assembly and math live in
 * src/features/stress-lab.
 */
export default function StressLabScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { isSignedIn } = useSession();

  const portfolio = useStressPortfolio(isSignedIn);
  const scenarios = useScenarios(isSignedIn);
  const run = useRunSimulation();
  const savePrediction = useSavePrediction();

  const [preview, setPreview] = useState<LabScenario | null>(null);
  const [prediction, setPrediction] = useState<PredictionDraft>(EMPTY_PREDICTION);
  const [predictionSaved, setPredictionSaved] = useState(false);

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

  // Save the recorded prediction (if any) against the new run, then navigate.
  // A prediction save failure never blocks the student from seeing results.
  const savePredictionForRun = (simulationId: string) => {
    if (prediction.direction === null) {
      return;
    }
    savePrediction.mutate({
      simulationId,
      direction: prediction.direction,
      estimatedChangeBp: parsePredictionEstimateBp(prediction.estimatePercent),
      pickedBest: prediction.pickedBest,
      pickedWorst: prediction.pickedWorst,
    });
  };

  const runScenario = (scenario: LabScenario) => {
    run.mutate(
      { scenarioId: scenario.id },
      {
        onSuccess: (row) => {
          setPreview(null);
          savePredictionForRun(row.id);
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

      <PredictionForm
        holdings={portfolio.data.holdings}
        value={prediction}
        onChange={setPrediction}
        onSubmit={() => setPredictionSaved(true)}
        isSaving={false}
        saved={predictionSaved}
      />

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

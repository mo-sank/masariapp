import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, Disclaimer, Screen, StateView, useToast } from '../../../src/components/ui';
import {
  AssetBreakdownTable,
  ChallengeTracker,
  DEFAULT_REFLECTION_QUESTIONS,
  PredictionResult,
  Recommendations,
  ReflectionForm,
  ResultsSummary,
  RiskObservations,
  SectorExposure,
} from '../../../src/features/stress-lab/components';
import {
  mapReflectionError,
  simulationResultFromRow,
  useChallengeProgress,
  usePrediction,
  useReflection,
  useSaveReflection,
  useSimulation,
  type ReflectionResponse,
} from '../../../src/features/stress-lab/data';
import { getScenario } from '../../../src/features/stress-lab/scenarios/scenarios';
import { useSession } from '../../../src/lib/auth0';
import { useTheme } from '../../../src/theme/theme-provider';

/**
 * Stress test results dashboard (FR-20–FR-24, FR-8, FR-26–FR-34).
 *
 * Reads the persisted simulation named by the `simulationId` route param and
 * renders the Phase-1 results (summary, per-holding table, sector exposure, risk
 * observations) plus the Phase-2 constructionist layer: how the recorded
 * prediction scored, improvement recommendations, per-scenario design
 * challenges, and a reflection form that saves and reloads. "Improve My
 * Portfolio" routes into the EXISTING brokerage so the student makes their own
 * changes (FR-8) — it modifies no holding. "Compare runs" opens the before/after
 * of two runs of the same scenario.
 *
 * The route stays thin: it resolves the param and session, drives
 * loading/empty/error states, seeds the reflection form from the reloaded
 * reflection, and maps the persisted row into the engine shape — all math lives
 * in src/features/stress-lab.
 */
export default function StressResultsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { isSignedIn } = useSession();
  const { simulationId } = useLocalSearchParams<{ simulationId: string }>();

  const { data, isLoading, isError, refetch } = useSimulation(simulationId, isSignedIn);
  const prediction = usePrediction(simulationId, isSignedIn);
  const reflection = useReflection(simulationId, isSignedIn);
  const challenges = useChallengeProgress(isSignedIn);
  const saveReflection = useSaveReflection();

  const result = useMemo(() => (data ? simulationResultFromRow(data) : null), [data]);
  const scenarioName = data ? (getScenario(data.scenario_id)?.name ?? data.scenario_id) : '';

  // Reflection answers: the saved reflection (reloaded, FR-34) seeds the form;
  // local edits override per question. Merging a memoised seed with an edits map
  // avoids seeding via a setState-in-effect (which cascades renders).
  const savedAnswers = useMemo(() => reflectionAnswers(reflection.data?.responses), [reflection.data]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const answers = useMemo(() => ({ ...savedAnswers, ...edits }), [savedAnswers, edits]);

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

  const submitReflection = () => {
    const responses: ReflectionResponse[] = DEFAULT_REFLECTION_QUESTIONS.map((q) => ({
      question: q.id,
      answer: (answers[q.id] ?? '').trim(),
    })).filter((r) => r.answer.length > 0);
    saveReflection.mutate(
      { simulationId: data.id, responses },
      {
        onError: (error) => toast.show(mapReflectionError(error), { tone: 'error' }),
      },
    );
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <ResultsSummary result={result} scenarioName={scenarioName} />

      {prediction.data ? <PredictionResult prediction={prediction.data} /> : null}

      <AssetBreakdownTable holdings={result.holdings} />
      <SectorExposure result={result} />
      <RiskObservations result={result} />
      <Recommendations result={result} />

      <ChallengeTracker
        scenarioId={data.scenario_id}
        result={result}
        progress={challenges.data ?? []}
      />

      <ReflectionForm
        answers={answers}
        onChangeAnswer={(questionId, answer) =>
          setEdits((prev) => ({ ...prev, [questionId]: answer }))
        }
        onSubmit={submitReflection}
        isSaving={saveReflection.isPending}
        saved={saveReflection.isSuccess || reflection.data != null}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          title="Improve My Portfolio"
          variant="primary"
          onPress={() => router.push('/(tabs)/explore')}
          accessibilityLabel="Go to the market to improve your portfolio"
        />
        <Button
          title="Compare runs"
          variant="secondary"
          onPress={() => router.push(`/stress-lab/compare/${data.scenario_id}`)}
          accessibilityLabel="Compare this scenario's runs"
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

/** Map a saved reflection's `responses` jsonb into a question→answer map. */
function reflectionAnswers(responses: unknown): Record<string, string> {
  if (!Array.isArray(responses)) {
    return {};
  }
  const answers: Record<string, string> = {};
  for (const item of responses) {
    if (item && typeof item === 'object' && 'question' in item && 'answer' in item) {
      const q = (item as { question?: unknown }).question;
      const a = (item as { answer?: unknown }).answer;
      if (typeof q === 'string' && typeof a === 'string') {
        answers[q] = a;
      }
    }
  }
  return answers;
}

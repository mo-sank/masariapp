/**
 * ChallengeTracker (FR-30–FR-32, Phase 2).
 *
 * The per-scenario design challenges for a result: each shows its objective and
 * whether this run meets it, re-runnable until met. When a run's verdict differs
 * from the stored status, the parent records it via `upsert_challenge_progress`
 * (the tracker only renders and reports; it never modifies the portfolio).
 *
 * The challenge is "met" the moment a run satisfies the objective; the student
 * gets there by re-designing their portfolio in the brokerage and running the
 * scenario again, not by any auto-change here.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import {
  challengesForScenario,
  evaluateChallenge,
  type ChallengeDefinition,
} from '../analysis/challenges';
import type { StressChallengeProgress } from '../data/rpc-schemas';
import type { SimulationResult } from '../engine/types';
import { SimulatedBadge } from './SimulatedBadge';

export interface ChallengeTrackerProps {
  /** Scenario the result is for; selects which challenges apply. */
  scenarioId: string;
  /** The simulated result this run produced. */
  result: SimulationResult;
  /** The caller's saved challenge-progress rows (for persisted status). */
  progress: readonly StressChallengeProgress[];
}

export function ChallengeTracker({ scenarioId, result, progress }: ChallengeTrackerProps) {
  const theme = useTheme();
  const challenges = challengesForScenario(scenarioId);

  if (challenges.length === 0) {
    return null;
  }

  const progressByChallenge = new Map(progress.map((p) => [p.challenge_id, p]));

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <View style={styles.titleRow}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Design challenges
        </Text>
        <SimulatedBadge />
      </View>

      {challenges.map((challenge) => (
        <ChallengeRow
          key={challenge.id}
          challenge={challenge}
          result={result}
          everMet={progressByChallenge.get(challenge.id)?.status === 'met'}
        />
      ))}

      <Text variant="caption" color="textMuted">
        Not met yet? Head to the brokerage, adjust your mix, and run this scenario again.
      </Text>
    </Card>
  );
}

/** One challenge: objective, this-run verdict, and whether it was ever met. */
function ChallengeRow({
  challenge,
  result,
  everMet,
}: {
  challenge: ChallengeDefinition;
  result: SimulationResult;
  everMet: boolean;
}) {
  const theme = useTheme();
  const evaluation = evaluateChallenge(challenge, result);
  // "Met" if this run meets it or a past run already did.
  const met = evaluation.met || everMet;
  const glyph = met ? '✓' : '○';
  const statusColor = met ? 'primary' : 'textMuted';
  const statusLabel = met ? 'Met' : 'In progress';

  return (
    <View style={{ gap: 2 }}>
      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        <Text variant="body" color={statusColor} style={styles.glyph}>
          {glyph}
        </Text>
        <View style={styles.body}>
          <Text variant="body" color="text">
            {challenge.title}
          </Text>
          <Text variant="caption" color="textMuted">
            {challenge.objective}
          </Text>
          <Text variant="caption" color={statusColor}>
            {statusLabel} · {evaluation.summary}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  glyph: {
    width: 16,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});

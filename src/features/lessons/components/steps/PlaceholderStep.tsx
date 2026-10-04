/**
 * Placeholder step component (shell stand-in for tasks 6-9).
 *
 * The real step components — CardsStep, McqStep, TrueFalseStep, PredictStep,
 * SortStep, MatchStep, SimStep, GuidedTradeStep — are built in later tasks
 * (6-9). Until each lands, the registry maps every step type to this
 * placeholder so the lesson-player shell (this task, 5) can be built, routed,
 * and tested end to end: it presents one step at a time, records an answer,
 * shows feedback, and advances through to completion.
 *
 * The placeholder is honest about being unfinished — it labels the step type and
 * shows the authored prompt/body so a developer can see which step is up — while
 * still satisfying the step contract (requirement 4.8: props in, onAnswer out):
 *   - For a step that CAN be scored, it offers two buttons that report a correct
 *     or an incorrect {@link Answer}, so the player's feedback + scoring path is
 *     exercisable now and in tests.
 *   - For an unscored step (cards, or an unscored predict/sim/guided_trade) it
 *     offers a single Continue button that calls `onContinue`.
 *
 * It is purely presentational: props in, answer/continue out, no network calls.
 * When the real component for a type ships, swap its entry in the registry; no
 * player change is needed.
 */

import { View, StyleSheet } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { Answer } from '../../scoring';
import type { Step } from '../../schema';

/** Whether this step can be scored, honouring the schema's per-type defaults. */
function canBeScored(step: Step): boolean {
  switch (step.type) {
    case 'cards':
    case 'guided_trade':
      return false;
    case 'predict':
    case 'sim':
      return step.scored === true;
    case 'mcq':
    case 'truefalse':
    case 'sort':
    case 'match':
      return step.scored !== false;
  }
}

/** A short human label for the step, shown while the real component is pending. */
function stepLabel(step: Step): string {
  return `${step.type} step`;
}

/** A one-line description of the step's authored content for the placeholder. */
function stepSummary(step: Step): string {
  switch (step.type) {
    case 'cards':
      return step.cards[0]?.body ?? '';
    case 'mcq':
    case 'truefalse':
    case 'predict':
    case 'sort':
    case 'match':
      return step.prompt;
    case 'sim':
      return step.goal;
    case 'guided_trade':
      return 'Guided trade (provided by the trading spec)';
  }
}

/**
 * Build a representative {@link Answer} for a scored step so the placeholder can
 * drive the player. `correct` selects an answer the scorer will mark right
 * (true) or wrong (false). Returns null for step types that are never scored.
 */
function buildAnswer(step: Step, correct: boolean): Answer | null {
  switch (step.type) {
    case 'mcq': {
      const wrong = step.options.find((o) => o.id !== step.correctId)?.id ?? step.correctId;
      return { stepId: step.id, type: 'mcq', optionId: correct ? step.correctId : wrong };
    }
    case 'truefalse':
      return { stepId: step.id, type: 'truefalse', value: correct ? step.answer : !step.answer };
    case 'predict': {
      // Only scored when correctId is set (schema-guaranteed); fall back safely.
      const right = step.correctId ?? step.options[0]?.id ?? '';
      const wrong = step.options.find((o) => o.id !== right)?.id ?? right;
      return { stepId: step.id, type: 'predict', optionId: correct ? right : wrong };
    }
    case 'sort': {
      const placements: Record<string, string> = {};
      for (const item of step.items) {
        // Correct: each item in its authored bucket. Incorrect: shove everything
        // into the first bucket, which fails the all-or-nothing check unless the
        // content already wanted that (rare and harmless for a placeholder).
        placements[item.id] = correct ? item.bucketId : step.buckets[0].id;
      }
      return { stepId: step.id, type: 'sort', placements };
    }
    case 'match': {
      const pairings: Record<string, string> = {};
      for (const pair of step.pairs) {
        pairings[pair.id] = correct ? pair.right : `${pair.right} (wrong)`;
      }
      return { stepId: step.id, type: 'match', pairings };
    }
    case 'sim':
      return { stepId: step.id, type: 'sim', score: correct ? 100 : 0 };
    case 'cards':
    case 'guided_trade':
      return null;
  }
}

export function PlaceholderStep({ step, onAnswer, onContinue }: StepComponentProps) {
  const theme = useTheme();
  const scored = canBeScored(step);

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        {stepLabel(step)}
      </Text>
      <Text variant="title">{stepSummary(step)}</Text>
      <Text variant="caption" color="textMuted">
        This step type is implemented in a later task. For now, choose how to
        continue.
      </Text>

      <View style={[styles.actions, { gap: theme.spacing.sm }]}>
        {scored ? (
          <>
            <Button
              title="Answer correctly"
              variant="primary"
              onPress={() => {
                const answer = buildAnswer(step, true);
                if (answer) onAnswer(answer);
                else onContinue();
              }}
            />
            <Button
              title="Answer incorrectly"
              variant="secondary"
              onPress={() => {
                const answer = buildAnswer(step, false);
                if (answer) onAnswer(answer);
                else onContinue();
              }}
            />
          </>
        ) : (
          <Button title="Continue" variant="primary" onPress={onContinue} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  actions: { width: '100%' },
});

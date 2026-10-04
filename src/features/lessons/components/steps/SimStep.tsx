/**
 * Sim step — render a hands-on lab (requirements 4.6, 8.5, 4.8).
 *
 * The lesson's `sim` step does not know about any individual lab. It looks the
 * lab up by `simId` in the {@link getSimComponent SimRegistry}, derives a stable
 * seed from the step id, and renders the lab with its authored `params` plus
 * that seed. When the lab finishes it reports a `{ score, summary }` outcome,
 * which this component turns into the right player signal:
 *   - a *scored* sim step reports a sim {@link Answer} (`{ type: 'sim', score }`)
 *     via `onAnswer`, so the pure scorer folds it into the lesson score and the
 *     player shows feedback (requirement 3.2);
 *   - an *unscored* sim step simply advances via `onContinue`.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("SimStep ... looks up
 * the lab in the SimRegistry, passes params + a seed, and on the lab's
 * onComplete reports a sim Answer ... when the step is scored (or onContinue
 * when unscored)").
 *
 * Seed (requirement 8.5): derived deterministically from the step id with
 * {@link seedFromString}, so the same step always drives the same simulation
 * across runs and in tests. SimStep never reads a clock or `Math.random`.
 *
 * Purity (requirement 4.8): props in, exactly one of `onAnswer` / `onContinue`
 * out per run. No network, no haptics — the labs grade themselves and the player
 * owns feedback. If content references a lab that is not implemented yet, the
 * step degrades to a labelled "not available" card with a Continue button rather
 * than crashing the player.
 */

import { createElement, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import { seedFromString } from '../../sims/seed';
import { getSimComponent } from '../sims/registry';
import type { SimOutcome } from '../sims/types';
import type { SimStep as SimStepType } from '../../schema';

/** Clamp a lab's reported score into the 0-100 range the scorer expects. */
function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function SimStep({ step, onAnswer, onContinue }: StepComponentProps<SimStepType>) {
  const theme = useTheme();

  // Resolve the lab for this simId, and derive a stable per-step seed. The seed
  // is memoised on the step id so the lab keeps the same seed across re-renders
  // (its randomness must not reshuffle mid-run).
  const lab = getSimComponent(step.simId);
  const seed = useMemo(() => seedFromString(step.id), [step.id]);

  const scored = step.scored === true;

  // Turn the lab's outcome into the player signal: a sim answer for a scored
  // step, or a plain advance for an unscored one.
  const handleComplete = (outcome: SimOutcome) => {
    if (scored) {
      onAnswer({ stepId: step.id, type: 'sim', score: clampScore(outcome.score) });
    } else {
      onContinue();
    }
  };

  // Content references a lab that is not implemented yet (e.g. pnl_replay /
  // opening_bell before task 9). Degrade gracefully instead of crashing.
  if (!lab) {
    return (
      <Card style={[styles.card, { gap: theme.spacing.md }]}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Hands-on lab
        </Text>
        <Text variant="title">{step.goal}</Text>
        <Text variant="caption" color="textMuted">
          This lab is not available yet.
        </Text>
        <Button
          title="Continue"
          variant="primary"
          onPress={onContinue}
          accessibilityLabel="Continue to the next step"
        />
      </Card>
    );
  }

  // Render the resolved lab with createElement rather than binding it to a local
  // JSX tag: the registry entries are stable module-level components, so this
  // does not create a new component type per render (mirroring StepRenderer).
  return createElement(lab, { params: step.params, seed, onComplete: handleComplete });
}

const styles = StyleSheet.create({
  card: { width: '100%' },
});

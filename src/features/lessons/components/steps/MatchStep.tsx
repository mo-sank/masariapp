/**
 * Match step — pair terms with definitions (requirements 4.5, 4.8).
 *
 * The learner matches each left-hand term with its right-hand definition, then
 * submits for the player to grade. The interaction is tap-based and fully
 * accessible: tap a term to select it, then tap a definition to pair the two.
 * Tapping a term that is already paired clears its pairing so it can be redone;
 * tapping a definition that is taken moves it to the newly selected term.
 *
 * The right-hand definitions are shown in a stable, content-independent order
 * (sorted) rather than lined up with their terms, so the learner cannot match by
 * position — they have to read. The order is derived purely from the authored
 * text, so it is deterministic and the step stays pure.
 *
 * Scoring is all-or-nothing and lives in the pure scorer (`scoring.ts`): the
 * component reports the right-hand *value* the learner paired with each pair id
 * as a match {@link Answer} (`pairings`). It never reveals which pairing is
 * correct or shows the explanation — the player does that after `onAnswer`
 * (requirement 3.2).
 *
 * Purity (requirement 4.8): props in, `onAnswer` out once, on submit. No
 * network, no scoring, no haptics.
 *
 * Accessibility (requirement 4.8): the prompt is a header; terms and
 * definitions are buttons whose labels announce the current pairing ("Share,
 * matched with: A slice of ownership"), and the selected term is exposed via
 * `accessibilityState.selected`. Submit is disabled, and says why, until every
 * term is matched.
 */

import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { MatchStep as MatchStepType } from '../../schema';

export function MatchStep({ step, onAnswer }: StepComponentProps<MatchStepType>) {
  const theme = useTheme();

  // The learner's pairings so far: pair id -> the right-hand value they chose.
  // A pair id absent from the map is still unmatched. A ref mirrors the map so a
  // definition tap (which must drop the term selected by the previous tap) reads
  // the live pairings from its handler, not a value captured by a stale render.
  const [pairings, setPairings] = useState<Record<string, string>>({});
  const pairingsRef = useRef<Record<string, string>>({});
  const setPairingsBoth = (
    updater: (prev: Record<string, string>) => Record<string, string>,
  ) => {
    const next = updater(pairingsRef.current);
    pairingsRef.current = next;
    setPairings(next);
  };
  // The term (pair id) currently selected by tapping, awaiting a definition. A
  // ref mirrors it so a definition tap reads the current selection even if the
  // term tap and the definition tap are processed in the same batch.
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const selectPair = (next: string | null) => {
    selectedRef.current = next;
    setSelectedPairId(next);
  };
  // Guards against a rapid double-submit the state value would not yet reflect.
  const submittedRef = useRef(false);

  // Right-hand definitions in a stable, position-independent order so they do
  // not line up with their terms. Sorted by text (then id to break ties), both
  // authored, so the order is deterministic without any randomness.
  const definitions = useMemo(
    () =>
      [...step.pairs].sort((a, b) => a.right.localeCompare(b.right) || a.id.localeCompare(b.id)),
    [step.pairs],
  );

  const allMatched = step.pairs.every((pair) => pairings[pair.id] !== undefined);

  // Tap a term: select it, or deselect if it was already selected. Selecting a
  // term that already has a pairing keeps the pairing but lets the learner
  // re-choose a definition for it.
  const handleTermPress = (pairId: string) => {
    selectPair(selectedRef.current === pairId ? null : pairId);
  };

  // Tap a definition: assign it to the selected term. Because each definition
  // can belong to only one term, remove it from any other term first.
  const handleDefinitionPress = (rightValue: string) => {
    const selected = selectedRef.current;
    if (selected === null) return;
    setPairingsBoth((prev) => {
      const next: Record<string, string> = {};
      // Drop any existing use of this definition so it moves, never duplicates.
      for (const [pairId, value] of Object.entries(prev)) {
        if (value !== rightValue) next[pairId] = value;
      }
      next[selected] = rightValue;
      return next;
    });
    selectPair(null);
  };

  // Submit the learner's pairings, reading the live map and completeness from
  // the ref so it is correct even if the last pairing tap and the submit tap are
  // processed in the same batch.
  const handleSubmit = () => {
    const current = pairingsRef.current;
    const complete = step.pairs.every((pair) => current[pair.id] !== undefined);
    if (!complete || submittedRef.current) return;
    submittedRef.current = true;
    onAnswer({ stepId: step.id, type: 'match', pairings: current });
  };

  // Which term, if any, a given definition is currently paired with.
  const termForDefinition = (rightValue: string): string | undefined => {
    const entry = Object.entries(pairings).find(([, value]) => value === rightValue);
    if (!entry) return undefined;
    return step.pairs.find((p) => p.id === entry[0])?.left;
  };

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Match each pair
      </Text>
      <Text variant="title">{step.prompt}</Text>

      <View style={[styles.columns, { gap: theme.spacing.md }]}>
        {/* Terms (left). Tap one to select it. */}
        <View
          accessibilityLabel="Terms"
          style={[styles.column, { gap: theme.spacing.sm }]}
        >
          {step.pairs.map((pair) => {
            const matchedValue = pairings[pair.id];
            const selected = selectedPairId === pair.id;
            return (
              <ChoiceRow
                key={pair.id}
                label={pair.left}
                selected={selected}
                accessibilityLabel={
                  matchedValue
                    ? `${pair.left}, matched with: ${matchedValue}. Tap to re-match.`
                    : `${pair.left}, not matched`
                }
                tint={matchedValue ? 'matched' : selected ? 'selected' : 'none'}
                onPress={() => handleTermPress(pair.id)}
              />
            );
          })}
        </View>

        {/* Definitions (right), in a stable scrambled order. Tap one to pair it
            with the selected term. */}
        <View
          accessibilityLabel="Definitions"
          style={[styles.column, { gap: theme.spacing.sm }]}
        >
          {definitions.map((pair) => {
            const pairedTerm = termForDefinition(pair.right);
            return (
              <ChoiceRow
                key={pair.id}
                label={pair.right}
                selected={false}
                accessibilityLabel={
                  pairedTerm
                    ? `${pair.right}, matched with: ${pairedTerm}`
                    : selectedPairId !== null
                      ? `${pair.right}, tap to match with the selected term`
                      : pair.right
                }
                tint={pairedTerm ? 'matched' : 'none'}
                onPress={() => handleDefinitionPress(pair.right)}
              />
            );
          })}
        </View>
      </View>

      <Button
        title="Check"
        variant="primary"
        disabled={!allMatched}
        onPress={handleSubmit}
        accessibilityLabel="Check your answer"
        accessibilityHint={allMatched ? undefined : 'Match every term first'}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * A single tappable term/definition row
 * ------------------------------------------------------------------ */

interface ChoiceRowProps {
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  /** Visual emphasis: a live selection, an established match, or neither. */
  tint: 'selected' | 'matched' | 'none';
  onPress: () => void;
}

function ChoiceRow({ label, selected, accessibilityLabel, tint, onPress }: ChoiceRowProps) {
  const theme = useTheme();
  const borderColor =
    tint === 'selected'
      ? theme.colors.primary
      : tint === 'matched'
        ? theme.colors.primary
        : theme.colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor,
          borderWidth: tint === 'none' ? 1 : 2,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="body" color={tint === 'none' ? 'text' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  columns: { width: '100%', flexDirection: 'row' },
  column: { flex: 1 },
  choice: { minHeight: 48, justifyContent: 'center' },
  pressed: { opacity: 0.8 },
});

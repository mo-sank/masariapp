/**
 * Predict step — commit before the reveal (requirements 4.3, 4.8).
 *
 * The learner MUST pick one option before anything is revealed (requirement
 * 4.3): the options are shown first, and only after a choice is locked in does
 * the step disclose the authored `reveal`. This "predict, then see what happens"
 * loop is the whole point of the step, so correctness is never hinted at before
 * the choice.
 *
 * The step is scored opt-in (schema default `scored: false`):
 *   - When scored, the player owns the reveal: the component reports the choice
 *     via `onAnswer` and the player's feedback sheet shows the correct/incorrect
 *     verdict and the `reveal` text (requirement 3.2). The component shows no
 *     reveal of its own in this case.
 *   - When unscored, there is nothing to grade, so the component reveals the
 *     outcome itself and offers a Continue button that calls `onContinue`.
 *
 * Purity (requirement 4.8): props in, exactly one of `onAnswer` / `onContinue`
 * out per interaction. No network, no scoring, no haptics. For a scored step the
 * component does not even read `correctId` — it only captures the learner's
 * prediction and lets the player judge it.
 *
 * Accessibility (requirement 4.8): the prompt is a header; each option is a
 * `radio` inside a `radiogroup` with its selected state exposed, so assistive
 * tech announces the prediction and "option N of M". For an unscored step the
 * reveal is announced after the choice and the Continue button is clearly
 * labelled.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionButton } from './OptionButton';
import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { PredictStep as PredictStepType } from '../../schema';

export function PredictStep({ step, onAnswer, onContinue }: StepComponentProps<PredictStepType>) {
  const theme = useTheme();

  // Whether the step contributes to the score. Scored is opt-in for predict;
  // when scored, the player (not this component) reveals the outcome.
  const scored = step.scored === true;

  // The learner's locked-in prediction. Null until they commit. Once set for an
  // unscored step, the reveal is shown; the UI never lets the choice change
  // (the prediction is a commitment — requirement 4.3).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    // A prediction can only be made once; ignore taps after the first commit.
    if (selectedId !== null) return;
    setSelectedId(optionId);

    if (scored) {
      // Scored: hand the choice to the player, which shows the reveal + verdict.
      onAnswer({ stepId: step.id, type: 'predict', optionId });
    }
    // Unscored: fall through and let the inline reveal render below.
  };

  // Once an unscored prediction is in, show the reveal and a Continue button.
  const revealed = !scored && selectedId !== null;

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Make your prediction
      </Text>
      <Text variant="title">{step.prompt}</Text>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={step.prompt}
        style={[styles.options, { gap: theme.spacing.sm }]}
      >
        {step.options.map((option, index) => (
          <OptionButton
            key={option.id}
            label={option.text}
            selected={selectedId === option.id}
            positionInSet={index + 1}
            setSize={step.options.length}
            onPress={() => handleSelect(option.id)}
          />
        ))}
      </View>

      {revealed ? (
        <View style={[styles.reveal, { gap: theme.spacing.md }]}>
          <Text
            variant="body"
            // Announce the reveal as a status so assistive tech reads it once the
            // prediction is locked in (requirement 4.3: show the outcome).
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Result: ${step.reveal}`}
          >
            {step.reveal}
          </Text>
          <Button
            title="Continue"
            variant="primary"
            onPress={onContinue}
            accessibilityLabel="Continue to the next step"
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  options: { width: '100%' },
  reveal: { width: '100%' },
});

/**
 * True/false step (requirements 4.2, 4.8).
 *
 * A single true-or-false question: the prompt followed by two choices, True and
 * False. Selecting one reports the learner's answer to the player via
 * `onAnswer` as a truefalse {@link Answer} carrying a boolean `value`; the
 * player shows the correct/incorrect verdict and the authored explanation
 * afterwards (requirement 3.2), so this component never reveals correctness.
 *
 * Purity (requirement 4.8): props in, `onAnswer` out. No network, no scoring, no
 * haptics, no knowledge of the correct answer — it only captures the choice.
 *
 * Accessibility (requirement 4.8): the prompt is a header; the two choices are
 * `radio`s inside a `radiogroup`, each with its selected state exposed, so
 * assistive tech announces the question and the two labelled options.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionButton } from './OptionButton';
import type { StepComponentProps } from './types';
import { Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { TrueFalseStep as TrueFalseStepType } from '../../schema';

// The two fixed choices, in the order they are shown.
const CHOICES = [
  { value: true, label: 'True' },
  { value: false, label: 'False' },
] as const;

export function TrueFalseStep({ step, onAnswer }: StepComponentProps<TrueFalseStepType>) {
  const theme = useTheme();
  // Which choice the learner tapped, so the UI can mark it selected. The player
  // records the first answer and advances, and the step is remounted per id, so
  // there is no need to block a second tap here.
  const [selected, setSelected] = useState<boolean | null>(null);

  const handleSelect = (value: boolean) => {
    setSelected(value);
    onAnswer({ stepId: step.id, type: 'truefalse', value });
  };

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        True or false?
      </Text>
      <Text variant="title">{step.prompt}</Text>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={step.prompt}
        style={[styles.options, { gap: theme.spacing.sm }]}
      >
        {CHOICES.map((choice, index) => (
          <OptionButton
            key={choice.label}
            label={choice.label}
            selected={selected === choice.value}
            positionInSet={index + 1}
            setSize={CHOICES.length}
            onPress={() => handleSelect(choice.value)}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  options: { width: '100%' },
});

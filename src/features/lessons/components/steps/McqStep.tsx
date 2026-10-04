/**
 * Multiple-choice step (requirements 4.2, 4.8).
 *
 * Renders a single-answer multiple-choice question: the prompt followed by a
 * list of tappable options. Picking an option reports the learner's choice to
 * the player via `onAnswer` as an mcq {@link Answer}; the player then shows the
 * correct/incorrect feedback and the authored explanation (requirement 3.2), so
 * this component never reveals correctness itself.
 *
 * Variants (requirement 4.2):
 *   - `standard`: the prompt is a question and the options are answers.
 *   - `explain`: the prompt asks the learner to pick the best *explanation*; the
 *     options are candidate explanations. The behaviour is identical — the only
 *     difference is a short lead-in label so the learner knows they are choosing
 *     an explanation rather than a fact.
 *
 * Purity (requirement 4.8): props in, `onAnswer` out. No network, no scoring, no
 * haptics, no knowledge of which option is correct — the component only captures
 * the learner's selection.
 *
 * Accessibility (requirement 4.8): the prompt is a header; each option is a
 * `radio` with its selected state exposed via `accessibilityState`, grouped
 * under a `radiogroup` so assistive tech announces "option N of M".
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionButton } from './OptionButton';
import type { StepComponentProps } from './types';
import { Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { McqStep as McqStepType } from '../../schema';

/** Lead-in shown above the options so the learner knows what they are choosing. */
function variantLabel(variant: McqStepType['variant']): string {
  return variant === 'explain' ? 'Pick the best explanation' : 'Choose one';
}

export function McqStep({ step, onAnswer }: StepComponentProps<McqStepType>) {
  const theme = useTheme();
  // Remember the tapped option so the UI can mark it selected. The player
  // records the first answer and advances via the feedback sheet, so there is no
  // need to lock input here — the step unmounts (keyed by id) before a second
  // answer could matter.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    setSelectedId(optionId);
    onAnswer({ stepId: step.id, type: 'mcq', optionId });
  };

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        {variantLabel(step.variant)}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  options: { width: '100%' },
});

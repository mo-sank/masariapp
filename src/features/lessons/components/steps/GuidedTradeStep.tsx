/**
 * Guided-trade step — labelled placeholder (requirement 4.7).
 *
 * A `guided_trade` step is where the learner would place a real order through
 * the trading order ticket in guided mode. That ticket is owned by a separate
 * spec (market-data-paper-trading); until it ships, requirement 4.7 calls for a
 * *labelled placeholder* here. This component is that placeholder — a proper,
 * named step component (not the generic dev `PlaceholderStep`) so the player
 * renders a clean, honest stand-in in real lessons.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md`
 * ("components/steps/*: ... GuidedTradeStep (placeholder until trading spec)";
 * schema: `guided_trade` carries `symbols: 'starter'` and `requireRationale:
 * true` and is never scored).
 *
 * Because the schema marks `guided_trade` as never scored, the step produces no
 * answer: it shows the learner what they will do once trading is available and a
 * single Continue button that advances via `onContinue` (requirement 4.8: props
 * in, continue out, no network). When the real ticket lands, swap this entry in
 * the step registry — no player change is needed.
 *
 * Accessibility: the step is introduced with a header, the goal is a title, and
 * the Continue button is labelled.
 */

import { StyleSheet, View } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { GuidedTradeStep as GuidedTradeStepType } from '../../schema';

export function GuidedTradeStep({ onContinue }: StepComponentProps<GuidedTradeStepType>) {
  const theme = useTheme();

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Guided trade
      </Text>
      <Text variant="title">Place your first practice trade</Text>
      <Text variant="body" color="textMuted">
        Soon you&apos;ll place a real practice order here — picking a starter
        stock and writing why you&apos;re buying it. The order ticket is coming
        with the trading update.
      </Text>

      <View style={[styles.actions, { gap: theme.spacing.sm }]}>
        <Button
          title="Continue"
          variant="primary"
          onPress={onContinue}
          accessibilityLabel="Continue to the next step"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  actions: { width: '100%' },
});

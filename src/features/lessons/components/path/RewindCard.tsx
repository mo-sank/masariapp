/**
 * RewindCard (requirement 7.2).
 *
 * The card on the learning path that invites the learner into a Rewind session
 * when missed items are due. Requirement 7.2: when the Learn tab opens and items
 * are due, show a Rewind card with the count — so this card is rendered only when
 * `dueCount > 0`; the screen hides it entirely when nothing is due (a `dueCount`
 * of 0 returns `null`).
 *
 * Mirrors {@link ContinueCard}: a prominent card near the top of the path with a
 * single primary action. Tapping it routes to the Rewind session screen (the
 * parent wires `onStart` to expo-router). The copy frames missed questions as
 * practice, not punishment (requirement 7's user story), and names the count so
 * the learner knows how short the session is.
 *
 * Purely presentational: the parent passes the due count (from {@link useRewind})
 * and an `onStart` callback; the card does not fetch or navigate itself.
 *
 * Accessibility: a filled primary Button carries the action with a label that
 * reads the count ("Start Rewind, N items to review"), and the count copy uses
 * correct singular/plural so a screen reader announces natural language.
 */
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';

export interface RewindCardProps {
  /** How many items are due for review (requirement 7.2). Must be > 0 to show. */
  dueCount: number;
  /** Called when the learner taps to start a Rewind session. */
  onStart: () => void;
}

/** "1 item" vs "N items", so the copy and the a11y label read naturally. */
function itemsLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

export function RewindCard({ dueCount, onStart }: RewindCardProps) {
  const theme = useTheme();

  // Nothing due -> no card (requirement 7.2 shows it only when items are due).
  if (dueCount <= 0) {
    return null;
  }

  const count = itemsLabel(dueCount);

  return (
    <Card style={[styles.card, { gap: theme.spacing.sm }]} testID="rewind-card">
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          REWIND
        </Text>
        <Text variant="title" color="text">
          Practice what you missed
        </Text>
        <Text variant="caption" color="textMuted">
          {`${count} ready · about 90 seconds`}
        </Text>
      </View>
      <Button
        title={`Review ${count}`}
        variant="primary"
        accessibilityLabel={`Start Rewind, ${count} to review`}
        onPress={onStart}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
});

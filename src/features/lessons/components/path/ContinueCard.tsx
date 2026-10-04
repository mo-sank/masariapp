/**
 * ContinueCard (requirement 2.4).
 *
 * The prominent "continue where you left off" call to action shown at the top of
 * the learning path when the learner has unfinished work. It names the next
 * available lesson and, when the lesson unlocks a feature, previews that too
 * (requirement 2.3) so the learner sees what finishing it earns.
 *
 * Purely presentational: the parent passes the lesson the Continue target points
 * at (computed by the pure path logic) and an `onPress` wired to expo-router.
 * The screen only renders this when there is a lesson to continue; a `null`
 * target means everything is done or locked, so the card simply isn't shown.
 *
 * Accessibility: a filled primary Button carries the action with a clear label
 * ("Continue: <title>"); the Button already exposes the `button` role and a
 * comfortable tap target.
 */
import { StyleSheet, View } from 'react-native';

import { featureLabel } from './feature-labels';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { Lesson } from '../../schema';

export interface ContinueCardProps {
  /** The next available lesson to continue with. */
  lesson: Lesson;
  /** Called with the lesson when the learner taps Continue. */
  onContinue: (lesson: Lesson) => void;
}

export function ContinueCard({ lesson, onContinue }: ContinueCardProps) {
  const theme = useTheme();
  const unlockText =
    lesson.unlocks.length > 0 ? lesson.unlocks.map(featureLabel).join(', ') : null;

  return (
    <Card style={[styles.card, { gap: theme.spacing.sm }]} testID="continue-card">
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          CONTINUE WHERE YOU LEFT OFF
        </Text>
        <Text variant="title" color="text">
          {lesson.title}
        </Text>
        <Text variant="caption" color="textMuted">
          {`About ${lesson.estimatedMinutes} min`}
          {unlockText ? ` · Unlocks ${unlockText}` : ''}
        </Text>
      </View>
      <Button
        title="Continue"
        variant="primary"
        accessibilityLabel={`Continue: ${lesson.title}`}
        onPress={() => onContinue(lesson)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
});

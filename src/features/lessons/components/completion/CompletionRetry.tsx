/**
 * Sub-pass retry screen (requirement 5.3).
 *
 * Shown when a lesson score is below the pass threshold. The server did not mark
 * the lesson completed, so instead of results this screen shows an encouraging
 * message (never "failed") and offers two paths: try the lesson again, or head
 * back to the learning path. The tone is supportive — a miss is practice, not a
 * punishment — matching the design's "encouraging retry screen".
 *
 * Presentational: it takes the lesson title, the score, the pass score, and two
 * navigation callbacks as props (no data fetching, no router import) so it is
 * driven the same way from the route and from tests. It uses the shared UI kit
 * and `useTheme`, and both actions carry accessibility labels.
 */
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';

export interface CompletionRetryProps {
  /** The lesson's title, shown in the header. */
  lessonTitle: string;
  /** The learner's score this attempt, 0-100. */
  scorePct: number;
  /** The lesson's pass threshold, 0-100. */
  passScore: number;
  /** Start the lesson over (the "Try again" button). */
  onRetry: () => void;
  /** Return to the learning path (the "Back to path" button). */
  onBackToPath: () => void;
}

export function CompletionRetry({
  lessonTitle,
  scorePct,
  passScore,
  onRetry,
  onBackToPath,
}: CompletionRetryProps) {
  const theme = useTheme();

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          So close!
        </Text>
        <Text variant="body" color="textMuted">
          {lessonTitle}
        </Text>
      </View>

      <Card style={{ gap: theme.spacing.sm }}>
        <Text
          variant="body"
          accessibilityLabel={`You scored ${scorePct} percent. You need ${passScore} percent to pass.`}
        >
          {`You scored ${scorePct}% — you need ${passScore}% to pass this one.`}
        </Text>
        <Text variant="caption" color="textMuted">
          Give it another go. Reviewing the misses makes them stick.
        </Text>
      </Card>

      <Button
        title="Try again"
        onPress={onRetry}
        accessibilityLabel="Try the lesson again"
      />
      <Button
        title="Back to path"
        variant="secondary"
        onPress={onBackToPath}
        accessibilityLabel="Back to the learning path"
      />
    </Screen>
  );
}

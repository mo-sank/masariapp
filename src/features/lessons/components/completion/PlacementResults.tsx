/**
 * Placement Quest results screen (requirements 6.1, 6.3, 6.4).
 *
 * Shown after the learner finishes the Placement Quest (L0). It is deliberately
 * NOT the scored results screen ({@link CompletionResults}): a placement
 * assessment has no pass/fail and must not reveal which answers were right or
 * wrong, nor show a score (requirement 6.3). So this screen shows no score, no
 * per-item breakdown, and no "X correct" — only encouraging, forward-looking
 * copy ("you're all set — here's where you'll start") and the feature(s) the
 * learner just unlocked (requirement 6.3's "here's where you'll start").
 *
 * Where the learner lands next: the Placement Quest unlocks the home path and a
 * view-only paper account (docs/masari-lesson-plan.md). Those unlocks come from
 * `complete_lesson` and are passed in as `unlocked`; each with a known route
 * gets a "go to feature" button, mirroring {@link CompletionResults}. The
 * primary action is simply "Start learning", which returns to the path where L0
 * is now complete and the first real lesson is available (requirement 6.1 flows
 * from the placement node into the rest of the path).
 *
 * Presentational: it takes the lesson title, the unlocked feature keys, and
 * navigation callbacks as props (no data fetching, no router import) so it is
 * driven the same way from the route and from tests. Every actionable element
 * carries an accessibility label.
 */
import { View } from 'react-native';

import { featureRoute } from './feature-routes';
import { Button, Card, Screen, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import { featureLabel } from '../path/feature-labels';

export interface PlacementResultsProps {
  /** The placement lesson's title, shown in the header. */
  lessonTitle: string;
  /** Feature keys unlocked by finishing the placement (from `complete_lesson`). */
  unlocked: string[];
  /** Navigate to a feature's route (the "go to feature" button). */
  onGoToFeature: (route: string) => void;
  /** Continue to the learning path (the primary "Start learning" button). */
  onStartLearning: () => void;
}

export function PlacementResults({
  lessonTitle,
  unlocked,
  onGoToFeature,
  onStartLearning,
}: PlacementResultsProps) {
  const theme = useTheme();

  // Only unlocks with a known destination get a navigation button; the rest are
  // still named so the learner sees what the placement opened up.
  const unlocks = unlocked.map((key) => ({
    key,
    label: featureLabel(key),
    route: featureRoute(key),
  }));

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {"You're all set!"}
        </Text>
        <Text variant="body" color="textMuted">
          {lessonTitle}
        </Text>
      </View>

      <Card style={{ gap: theme.spacing.md }}>
        <Text variant="title" accessibilityElementsHidden importantForAccessibility="no">
          🧭
        </Text>
        <Text variant="body" color="text">
          Thanks for the check-in. There are no right or wrong answers here — we
          just used it to find the best place for you to start.
        </Text>
        <Text variant="body" color="textMuted">
          Your path is ready below. Jump in whenever you like.
        </Text>
      </Card>

      {unlocks.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="body" accessibilityRole="header">
            You unlocked
          </Text>
          {unlocks.map((unlock) => (
            <Card key={unlock.key} style={{ gap: theme.spacing.sm }}>
              <Text variant="body">{`🎉 ${unlock.label}`}</Text>
              {unlock.route ? (
                <Button
                  title={`Go to ${unlock.label}`}
                  variant="secondary"
                  onPress={() => onGoToFeature(unlock.route as string)}
                  accessibilityLabel={`Go to ${unlock.label}`}
                />
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      <Button
        title="Start learning"
        variant="primary"
        onPress={onStartLearning}
        accessibilityLabel="Start learning on your path"
      />
    </Screen>
  );
}

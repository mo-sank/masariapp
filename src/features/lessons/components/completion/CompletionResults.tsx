/**
 * Lesson results screen (requirements 5.4, 5.6).
 *
 * Shown after a passing completion. It presents what the learner earned — XP,
 * current streak, any Streak Freeze, and the features newly unlocked — and gives
 * a "go to feature" button for each unlock that has a destination (requirement
 * 5.4). A "Back to path" button returns to the Learn tab.
 *
 * Replay handling (requirement 5.6): a replayed lesson awards no extra XP and no
 * new unlocks. The screen reads that from the result (`firstCompletion === false`
 * -> `xpAwarded === 0`, empty `unlocked`) and shows an encouraging "Nice replay"
 * message with no XP figure, rather than a jarring "0 XP". The streak and freeze
 * counts are still shown because a replay can still extend a streak.
 *
 * Presentational: it takes the parsed result, the lesson title, and navigation
 * callbacks as props (no data fetching, no router import) so it is driven the
 * same way from the route and from tests. It uses the shared UI kit and
 * `useTheme`, and every actionable element carries an accessibility label.
 */
import { View } from 'react-native';

import { featureRoute } from './feature-routes';
import { Button, Card, Screen, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { CompletionPassed } from '../../api/complete-lesson';
import { featureLabel } from '../path/feature-labels';

export interface CompletionResultsProps {
  /** The parsed passing result from `complete_lesson`. */
  result: CompletionPassed;
  /** The completed lesson's title, shown in the header. */
  lessonTitle: string;
  /** Navigate to a feature's route (the "go to feature" button). */
  onGoToFeature: (route: string) => void;
  /** Return to the learning path (the "Back to path" button). */
  onBackToPath: () => void;
}

export function CompletionResults({
  result,
  lessonTitle,
  onGoToFeature,
  onBackToPath,
}: CompletionResultsProps) {
  const theme = useTheme();

  // Only unlocks with a known destination get a navigation button; the rest are
  // still shown by name so the learner sees everything they earned.
  const unlocks = result.unlocked.map((key) => ({
    key,
    label: featureLabel(key),
    route: featureRoute(key),
  }));

  // Requirement 5.6: a replay awards no XP. Show encouragement, not "0 XP".
  const earnedXp = result.firstCompletion && result.xpAwarded > 0;

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {earnedXp ? 'Lesson complete!' : 'Nice replay!'}
        </Text>
        <Text variant="body" color="textMuted">
          {lessonTitle}
        </Text>
      </View>

      <Card style={{ gap: theme.spacing.md }}>
        {earnedXp ? (
          <Stat
            emoji="⭐"
            value={`+${result.xpAwarded} XP`}
            label="Experience earned"
            accessibilityLabel={`You earned ${result.xpAwarded} experience points`}
          />
        ) : (
          <Stat
            emoji="🔁"
            value="No new XP"
            label="You already earned XP for this lesson"
            accessibilityLabel="No new experience points — you already earned XP for this lesson"
          />
        )}

        <Stat
          emoji="🔥"
          value={`${result.streak} day${result.streak === 1 ? '' : 's'}`}
          label="Current streak"
          accessibilityLabel={`Current streak: ${result.streak} ${
            result.streak === 1 ? 'day' : 'days'
          }`}
        />

        <Stat
          emoji="❄️"
          value={`${result.streakFreezes}`}
          label={`Streak Freeze${result.streakFreezes === 1 ? '' : 's'}`}
          accessibilityLabel={`${result.streakFreezes} Streak ${
            result.streakFreezes === 1 ? 'Freeze' : 'Freezes'
          }`}
        />
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
                  onPress={() => onGoToFeature(unlock.route as string)}
                  accessibilityLabel={`Go to ${unlock.label}`}
                />
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      <Button
        title="Back to path"
        variant="secondary"
        onPress={onBackToPath}
        accessibilityLabel="Back to the learning path"
      />
    </Screen>
  );
}

/** One labeled stat row (emoji + value + caption) used by the results card. */
function Stat({
  emoji,
  value,
  label,
  accessibilityLabel,
}: {
  emoji: string;
  value: string;
  label: string;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
    >
      <Text variant="title" accessibilityElementsHidden importantForAccessibility="no">
        {emoji}
      </Text>
      <View style={{ flex: 1 }}>
        <Text variant="body" accessibilityElementsHidden importantForAccessibility="no">
          {value}
        </Text>
        <Text
          variant="caption"
          color="textMuted"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

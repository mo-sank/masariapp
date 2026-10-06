/**
 * StatsHeader (requirements 3.1, 3.4).
 *
 * The progress summary shown at the top of the Learn and Profile tabs: XP total,
 * current streak, longest streak, and Streak Freezes (0-3), read from
 * `user_stats` (requirement 3.1). It is purely presentational — the caller
 * passes the already-fetched values from `useStats` — so it stays a pure
 * function of its props, renders identically on both screens, and is trivial to
 * test. Because the caller's `useStats` query (`['stats']`) is invalidated by
 * the completion flow, finishing a lesson refreshes these numbers with no manual
 * reload (requirement 3.4).
 *
 * Each stat is one labelled cell: a glanceable value with a caption, and an
 * `accessibilityLabel` that reads the full phrase ("1,250 XP", "5 day streak")
 * so a screen reader never announces a bare number. Values default to zero so a
 * brand-new learner (no stats row yet) renders a clean "0" rather than blanks.
 */
import { View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface StatsHeaderProps {
  /** Total XP earned. */
  xp?: number;
  /** Current streak length in days. */
  streakCurrent?: number;
  /** Longest streak ever reached, in days. */
  streakLongest?: number;
  /** Streak Freezes banked (0-3). */
  streakFreezes?: number;
}

export function StatsHeader({
  xp = 0,
  streakCurrent = 0,
  streakLongest = 0,
  streakFreezes = 0,
}: StatsHeaderProps) {
  const theme = useTheme();

  return (
    <Card>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}
        accessibilityRole="summary"
      >
        <Stat label="XP" value={xp.toLocaleString()} a11y={`${xp} XP`} />
        <Stat
          label="Streak"
          value={`🔥 ${streakCurrent}`}
          a11y={`${streakCurrent} day streak`}
        />
        <Stat
          label="Longest"
          value={`${streakLongest}`}
          a11y={`Longest streak ${streakLongest} days`}
        />
        <Stat
          label="Freezes"
          value={`❄️ ${streakFreezes}`}
          a11y={`${streakFreezes} streak freezes`}
        />
      </View>
    </Card>
  );
}

interface StatProps {
  /** Short caption under the value. */
  label: string;
  /** The glanceable value (may include an emoji). */
  value: string;
  /** Full phrase a screen reader announces for this cell. */
  a11y: string;
}

/** One labelled stat cell: value above, caption below, read as one phrase. */
function Stat({ label, value, a11y }: StatProps) {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={a11y} style={{ gap: theme.spacing.xs }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

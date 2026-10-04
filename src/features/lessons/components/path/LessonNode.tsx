/**
 * LessonNode (requirements 2.1, 2.2, 2.3).
 *
 * One lesson on the learning path, rendered in one of three states
 * (requirement 2.2):
 *   - `available`: tappable; opens `/lesson/<id>` (via the `onOpen` the parent
 *     wires to expo-router).
 *   - `completed`: tappable (lessons can be replayed, design "Completion flow");
 *     marked with a check.
 *   - `locked`: non-tappable, dimmed, with a hint naming the prerequisite to
 *     finish first (requirement 2.2).
 *
 * Every node shows its title, the authored estimate (requirement 2.3 asks for
 * "an estimated 3-4 minutes"), and the feature(s) it unlocks (requirement 2.3).
 * Placement and boss lessons get a small kind badge so the path reads as a mix
 * of lessons, boss battles, and the placement quest (requirement 2.1).
 *
 * Purely presentational: it takes a status-tagged lesson and an `onOpen`
 * callback and renders — it does not fetch or navigate itself, so it stays easy
 * to test and the route wiring lives in the screen.
 *
 * Accessibility (requirement 2.2): the whole node is one `button` with a label
 * that reads the title, state, estimate, and unlock. A locked node reports
 * `accessibilityState.disabled` and is not pressable, and its hint explains what
 * to finish first.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { featureLabel } from './feature-labels';
import { Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { Lesson, LessonKind } from '../../schema';
import type { LessonStatus, PathLesson } from '../../path';

export interface LessonNodeProps {
  /** The lesson with its computed status and (for locked) block hint. */
  node: PathLesson;
  /** Called with the lesson when an available/completed node is tapped. */
  onOpen: (lesson: Lesson) => void;
}

/** A short badge for non-lesson kinds so the path shows its special nodes. */
function kindBadge(kind: LessonKind): string | null {
  switch (kind) {
    case 'placement':
      return 'Placement';
    case 'boss':
      return 'Boss';
    case 'lesson':
    default:
      return null;
  }
}

/** The status glyph shown on the node (decorative; the label carries meaning). */
function statusIcon(status: LessonStatus): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'locked':
      return '🔒';
    case 'available':
    default:
      return '▶';
  }
}

/** Build the single accessibility label describing the node and its state. */
function buildAccessibilityLabel(node: PathLesson, unlockText: string | null): string {
  const { lesson, status, blockedByTitle } = node;
  const parts = [lesson.title];
  if (status === 'completed') {
    parts.push('completed');
  } else if (status === 'locked') {
    parts.push(
      blockedByTitle ? `locked, finish ${blockedByTitle} first` : 'locked',
    );
  } else {
    parts.push('available');
  }
  parts.push(`about ${lesson.estimatedMinutes} minutes`);
  if (unlockText) {
    parts.push(`unlocks ${unlockText}`);
  }
  return parts.join(', ');
}

export function LessonNode({ node, onOpen }: LessonNodeProps) {
  const theme = useTheme();
  const { lesson, status, blockedByTitle } = node;

  const isLocked = status === 'locked';
  const badge = kindBadge(lesson.kind);
  const unlockText =
    lesson.unlocks.length > 0 ? lesson.unlocks.map(featureLabel).join(', ') : null;

  const borderColor = status === 'completed' ? theme.colors.primary : theme.colors.border;

  // The card surface and its contents are the same in every state; only the
  // outer wrapper differs — a Pressable for tappable nodes, an inert View for
  // locked ones (requirement 2.2: locked nodes are non-tappable).
  const content = (
    <Card style={[styles.card, { gap: theme.spacing.xs, borderColor }, isLocked && styles.locked]}>
      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        <Text
          variant="title"
          style={styles.icon}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {statusIcon(status)}
        </Text>
        <View style={styles.titleBlock}>
          <Text variant="body" color="text" style={styles.title}>
            {lesson.title}
          </Text>
          <Text variant="caption" color="textMuted">
            {`About ${lesson.estimatedMinutes} min`}
            {badge ? ` · ${badge}` : ''}
          </Text>
        </View>
      </View>

      {unlockText ? (
        <Text variant="caption" color="primary" testID={`lesson-node-unlock-${lesson.id}`}>
          {`Unlocks ${unlockText}`}
        </Text>
      ) : null}

      {isLocked ? (
        <Text variant="caption" color="textMuted" testID={`lesson-node-hint-${lesson.id}`}>
          {blockedByTitle ? `Finish ${blockedByTitle} first` : 'Finish the previous lesson first'}
        </Text>
      ) : null}
    </Card>
  );

  const accessibilityLabel = buildAccessibilityLabel(node, unlockText);

  if (isLocked) {
    return (
      <View
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: true }}
        testID={`lesson-node-${lesson.id}`}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => onOpen(lesson)}
      testID={`lesson-node-${lesson.id}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  locked: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 20,
    lineHeight: 24,
    width: 28,
    textAlign: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
});

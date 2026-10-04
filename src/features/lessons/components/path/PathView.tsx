/**
 * PathView (requirements 2.1, 2.2, 2.3, 2.4).
 *
 * The scrollable learning path: a prominent Continue card (when there is
 * unfinished work, requirement 2.4) followed by the lessons grouped by unit,
 * each unit introduced by a {@link UnitHeader} (requirement 2.1) and each lesson
 * drawn as a {@link LessonNode} in its available/locked/completed state with its
 * estimate and unlock preview (requirements 2.2, 2.3).
 *
 * Presentational and pure of data concerns: it takes the already-computed
 * {@link LearningPath} (from the pure path logic via `useLearningPath`) and a
 * single `onOpenLesson` callback. The screen owns the data fetch and the
 * expo-router navigation; this component just lays the path out. That keeps the
 * state matrix (empty / with-continue / all-complete / locked nodes) easy to
 * render in tests without a network.
 *
 * An empty catalog (no lessons authored yet) renders a friendly empty state
 * rather than a blank scroll view.
 */
import { StyleSheet, View } from 'react-native';

import { ContinueCard } from './ContinueCard';
import { LessonNode } from './LessonNode';
import { UnitHeader } from './UnitHeader';
import { StateView, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import type { LearningPath } from '../../path';
import type { Lesson } from '../../schema';

export interface PathViewProps {
  /** The computed path: units with status-tagged lessons and the Continue target. */
  path: LearningPath;
  /** Called with a lesson when an available/completed node (or Continue) is opened. */
  onOpenLesson: (lesson: Lesson) => void;
}

export function PathView({ path, onOpenLesson }: PathViewProps) {
  const theme = useTheme();
  const hasLessons = path.units.some((u) => u.lessons.length > 0);

  if (!hasLessons) {
    return (
      <StateView
        kind="empty"
        title="Lessons are on the way"
        message="Your learning path will appear here. Check back soon to start your first lesson."
      />
    );
  }

  return (
    <View style={[styles.container, { gap: theme.spacing.sm }]} testID="path-view">
      {path.continueLesson ? (
        <ContinueCard lesson={path.continueLesson} onContinue={onOpenLesson} />
      ) : (
        <Text variant="body" color="textMuted" style={styles.allDone}>
          {"You're all caught up. More lessons are coming soon."}
        </Text>
      )}

      {path.units.map((unit) => (
        <View key={unit.unit} style={[styles.unit, { gap: theme.spacing.sm }]}>
          <UnitHeader unit={unit.unit} />
          {unit.lessons.map((node) => (
            <LessonNode key={node.lesson.id} node={node} onOpen={onOpenLesson} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  unit: {
    width: '100%',
  },
  allDone: {
    marginVertical: 8,
  },
});

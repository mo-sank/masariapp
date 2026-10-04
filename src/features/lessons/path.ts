/**
 * Learning path status logic (requirements 2.1, 2.2, 2.4).
 *
 * Pure functions that turn the bundled lesson catalog plus the learner's
 * progress into the shape the Learn tab renders: each lesson tagged
 * available/locked/completed, grouped into units, with the single "continue
 * where you left off" lesson picked out.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("Learning path
 * logic"):
 *   status(lesson) = completed if lesson_progress.status = 'completed';
 *   available if prerequisite completed (or none); else locked.
 *   Continue CTA = first available non-completed lesson by unit and order.
 *   Locked nodes show "Finish <prerequisite title> first".
 *
 * Everything here is pure data — no React, Expo, React Native, or network
 * imports — so it runs identically in the components, in Jest, and anywhere
 * else. The components pass the lesson list (already sorted by unit then order
 * by `content.ts`) and a map of completed lesson ids; this module never fetches.
 */

import type { Lesson } from './schema';

/** The three visual states a lesson node can be in (requirement 2.2). */
export type LessonStatus = 'completed' | 'available' | 'locked';

/** A lesson decorated with its computed path status for the UI to render. */
export interface PathLesson {
  /** The underlying parsed lesson. */
  lesson: Lesson;
  /** Its status for this learner. */
  status: LessonStatus;
  /**
   * For a locked lesson, the title of the prerequisite the learner must finish
   * first (requirement 2.2's hint). `null` for available/completed lessons, or
   * when the prerequisite id is not in the catalog.
   */
  blockedByTitle: string | null;
}

/** A unit's worth of lessons, in path order (requirement 2.1 groups by unit). */
export interface PathUnit {
  /** The unit number (lessons share this). */
  unit: number;
  /** The unit's lessons, each with status, in order. */
  lessons: PathLesson[];
}

/**
 * Compute the status of a single lesson.
 *
 * - `completed` when the learner has completed it.
 * - `available` when it has no prerequisite, or the prerequisite is completed.
 * - `locked` otherwise.
 *
 * `completedIds` is the set of lesson ids the learner has completed (from
 * `lesson_progress` rows with status 'completed').
 */
export function lessonStatus(lesson: Lesson, completedIds: ReadonlySet<string>): LessonStatus {
  if (completedIds.has(lesson.id)) {
    return 'completed';
  }
  if (lesson.prerequisite === null || completedIds.has(lesson.prerequisite)) {
    return 'available';
  }
  return 'locked';
}

/**
 * Decorate every lesson with its status and, for locked lessons, the title of
 * the prerequisite that blocks it. Lessons are returned in the same order they
 * were given (callers pass the unit/order-sorted list from `listLessons()`).
 */
export function toPathLessons(
  lessons: readonly Lesson[],
  completedIds: ReadonlySet<string>,
): PathLesson[] {
  const titleById = new Map(lessons.map((l) => [l.id, l.title]));
  return lessons.map((lesson) => {
    const status = lessonStatus(lesson, completedIds);
    const blockedByTitle =
      status === 'locked' && lesson.prerequisite !== null
        ? (titleById.get(lesson.prerequisite) ?? null)
        : null;
    return { lesson, status, blockedByTitle };
  });
}

/**
 * Group decorated lessons into units, preserving order. Input is assumed sorted
 * by unit then order (as `listLessons()` returns), so a unit's lessons stay
 * contiguous and ordered; units appear in first-seen order.
 */
export function groupByUnit(pathLessons: readonly PathLesson[]): PathUnit[] {
  const units: PathUnit[] = [];
  const indexByUnit = new Map<number, number>();
  for (const pl of pathLessons) {
    const unit = pl.lesson.unit;
    let idx = indexByUnit.get(unit);
    if (idx === undefined) {
      idx = units.length;
      indexByUnit.set(unit, idx);
      units.push({ unit, lessons: [] });
    }
    units[idx].lessons.push(pl);
  }
  return units;
}

/**
 * The lesson for the "Continue" call to action (requirement 2.4): the first
 * available, not-yet-completed lesson by unit then order. Returns `null` when
 * there is nothing to continue — either the learner has completed everything, or
 * the only remaining lessons are locked. Callers pass the ordered list, so
 * "first" here is simply the first match.
 */
export function nextContinueLesson(pathLessons: readonly PathLesson[]): Lesson | null {
  const next = pathLessons.find((pl) => pl.status === 'available');
  return next ? next.lesson : null;
}

/** The fully computed path the Learn tab renders. */
export interface LearningPath {
  /** Units in order, each with its status-tagged lessons. */
  units: PathUnit[];
  /** The lesson the Continue CTA points at, or `null` when none. */
  continueLesson: Lesson | null;
}

/**
 * Build the whole learning path from the ordered lesson catalog and the set of
 * completed lesson ids. One call produces everything the Learn tab needs: the
 * unit groups (each lesson tagged available/locked/completed with a block hint)
 * and the Continue target.
 */
export function buildLearningPath(
  lessons: readonly Lesson[],
  completedIds: ReadonlySet<string>,
): LearningPath {
  const pathLessons = toPathLessons(lessons, completedIds);
  return {
    units: groupByUnit(pathLessons),
    continueLesson: nextContinueLesson(pathLessons),
  };
}

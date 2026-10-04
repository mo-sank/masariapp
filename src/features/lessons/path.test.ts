/**
 * Unit tests for the pure learning-path logic (requirements 2.1, 2.2, 2.4).
 *
 * Covers the status rule (completed/available/locked), the locked-lesson block
 * hint, unit grouping order, and the Continue-CTA selection — all with plain
 * data, no React or network.
 */

import {
  buildLearningPath,
  groupByUnit,
  lessonStatus,
  nextContinueLesson,
  toPathLessons,
} from './path';
import type { Lesson } from './schema';

/** Minimal lesson factory; only the fields the path logic reads matter here. */
function makeLesson(partial: Partial<Lesson> & Pick<Lesson, 'id'>): Lesson {
  return {
    unit: 1,
    order: 1,
    kind: 'lesson',
    title: partial.id,
    bigIdea: 'idea',
    estimatedMinutes: 3,
    xp: 10,
    passScore: 60,
    prerequisite: null,
    concepts: ['c'],
    unlocks: [],
    steps: [{ id: 's1', type: 'cards', cards: [{ body: 'x' }] }],
    ...partial,
  } as Lesson;
}

describe('lessonStatus', () => {
  it('is completed when the lesson id is in the completed set', () => {
    const lesson = makeLesson({ id: 'L1.1', prerequisite: 'L0' });
    expect(lessonStatus(lesson, new Set(['L1.1']))).toBe('completed');
  });

  it('is available when there is no prerequisite', () => {
    const lesson = makeLesson({ id: 'L0', prerequisite: null });
    expect(lessonStatus(lesson, new Set())).toBe('available');
  });

  it('is available when the prerequisite is completed', () => {
    const lesson = makeLesson({ id: 'L1.1', prerequisite: 'L0' });
    expect(lessonStatus(lesson, new Set(['L0']))).toBe('available');
  });

  it('is locked when the prerequisite is not completed', () => {
    const lesson = makeLesson({ id: 'L1.1', prerequisite: 'L0' });
    expect(lessonStatus(lesson, new Set())).toBe('locked');
  });

  it('prefers completed over available even when the prerequisite is done', () => {
    const lesson = makeLesson({ id: 'L1.1', prerequisite: 'L0' });
    expect(lessonStatus(lesson, new Set(['L0', 'L1.1']))).toBe('completed');
  });
});

describe('toPathLessons', () => {
  it('names the blocking prerequisite title for a locked lesson', () => {
    const lessons = [
      makeLesson({ id: 'L0', title: 'Placement', prerequisite: null }),
      makeLesson({ id: 'L1.1', title: 'Slice the Pizza', prerequisite: 'L0' }),
    ];
    const [, locked] = toPathLessons(lessons, new Set());
    expect(locked.status).toBe('locked');
    expect(locked.blockedByTitle).toBe('Placement');
  });

  it('leaves blockedByTitle null for available and completed lessons', () => {
    const lessons = [
      makeLesson({ id: 'L0', prerequisite: null }),
      makeLesson({ id: 'L1.1', prerequisite: 'L0' }),
    ];
    const [available, availableBecausePrereqDone] = toPathLessons(lessons, new Set(['L0']));
    expect(available.status).toBe('completed');
    expect(available.blockedByTitle).toBeNull();
    expect(availableBecausePrereqDone.status).toBe('available');
    expect(availableBecausePrereqDone.blockedByTitle).toBeNull();
  });

  it('falls back to null when the prerequisite id is not in the catalog', () => {
    const lessons = [makeLesson({ id: 'L1.1', prerequisite: 'ghost' })];
    const [locked] = toPathLessons(lessons, new Set());
    expect(locked.status).toBe('locked');
    expect(locked.blockedByTitle).toBeNull();
  });
});

describe('groupByUnit', () => {
  it('groups lessons into units in first-seen order, preserving lesson order', () => {
    const lessons = [
      makeLesson({ id: 'L1.1', unit: 1, order: 1 }),
      makeLesson({ id: 'L1.2', unit: 1, order: 2 }),
      makeLesson({ id: 'L2.1', unit: 2, order: 1 }),
    ];
    const units = groupByUnit(toPathLessons(lessons, new Set()));
    expect(units.map((u) => u.unit)).toEqual([1, 2]);
    expect(units[0].lessons.map((l) => l.lesson.id)).toEqual(['L1.1', 'L1.2']);
    expect(units[1].lessons.map((l) => l.lesson.id)).toEqual(['L2.1']);
  });

  it('returns an empty array for no lessons', () => {
    expect(groupByUnit([])).toEqual([]);
  });
});

describe('nextContinueLesson', () => {
  it('picks the first available non-completed lesson in order', () => {
    const lessons = [
      makeLesson({ id: 'L0', prerequisite: null }),
      makeLesson({ id: 'L1.1', prerequisite: 'L0' }),
      makeLesson({ id: 'L1.2', prerequisite: 'L1.1' }),
    ];
    // L0 completed -> L1.1 is the first available, L1.2 still locked.
    const path = toPathLessons(lessons, new Set(['L0']));
    expect(nextContinueLesson(path)?.id).toBe('L1.1');
  });

  it('returns null when every lesson is completed', () => {
    const lessons = [
      makeLesson({ id: 'L0', prerequisite: null }),
      makeLesson({ id: 'L1.1', prerequisite: 'L0' }),
    ];
    const path = toPathLessons(lessons, new Set(['L0', 'L1.1']));
    expect(nextContinueLesson(path)).toBeNull();
  });

  it('returns null when the only remaining lessons are locked', () => {
    const lessons = [makeLesson({ id: 'L1.1', prerequisite: 'L0' })];
    expect(nextContinueLesson(toPathLessons(lessons, new Set()))).toBeNull();
  });
});

describe('buildLearningPath', () => {
  it('assembles units and the continue target in one call', () => {
    const lessons = [
      makeLesson({ id: 'L0', unit: 0, order: 1, prerequisite: null, title: 'Placement' }),
      makeLesson({ id: 'L1.1', unit: 1, order: 1, prerequisite: 'L0' }),
      makeLesson({ id: 'L1.2', unit: 1, order: 2, prerequisite: 'L1.1' }),
    ];
    const path = buildLearningPath(lessons, new Set(['L0']));

    expect(path.units.map((u) => u.unit)).toEqual([0, 1]);
    expect(path.continueLesson?.id).toBe('L1.1');

    const l12 = path.units[1].lessons.find((l) => l.lesson.id === 'L1.2');
    expect(l12?.status).toBe('locked');
    expect(l12?.blockedByTitle).toBe('L1.1');
  });
});

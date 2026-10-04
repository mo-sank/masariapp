import { buildReviewItems, gradeReviewAnswer } from './rewind-session';
import type { DueRewindItem } from './hooks/use-rewind';
import type { Lesson, Step } from './schema';

// Mock the content loader so the session logic can be tested against fixture
// lessons rather than the (nearly empty) bundled catalog.
const mockGetLesson = jest.fn();
jest.mock('./content', () => ({
  getLesson: (id: string) => mockGetLesson(id),
}));

function mcqStep(id: string, correctId = 'a'): Step {
  return {
    id,
    type: 'mcq',
    prompt: `q ${id}`,
    options: [
      { id: 'a', text: 'right' },
      { id: 'b', text: 'wrong' },
    ],
    correctId,
    explanation: 'because',
    variant: 'standard',
    scored: true,
    concept: 'ownership',
  } as Step;
}

function lesson(id: string, steps: Step[]): Lesson {
  return {
    id,
    unit: 1,
    order: 1,
    kind: 'lesson',
    title: id,
    bigIdea: 'idea',
    estimatedMinutes: 3,
    xp: 10,
    passScore: 60,
    prerequisite: null,
    concepts: ['ownership'],
    unlocks: [],
    steps,
  } as Lesson;
}

function dueRow(partial: Partial<DueRewindItem> & Pick<DueRewindItem, 'item_id'>): DueRewindItem {
  return { id: `id-${partial.item_id}`, lesson_id: 'L1.1', box: 0, ...partial };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildReviewItems (7.3)', () => {
  it('resolves each due row to its authored step, preserving order', () => {
    const l = lesson('L1.1', [mcqStep('s1'), mcqStep('s2')]);
    mockGetLesson.mockImplementation((id) => (id === 'L1.1' ? l : undefined));

    const result = buildReviewItems([
      dueRow({ item_id: 's2' }),
      dueRow({ item_id: 's1' }),
    ]);

    expect(result.map((r) => r.itemId)).toEqual(['s2', 's1']);
    expect(result[0].step.id).toBe('s2');
    expect(result[0].lessonId).toBe('L1.1');
  });

  it('caps the session at the limit (~5 by default)', () => {
    const steps = Array.from({ length: 8 }, (_, i) => mcqStep(`s${i}`));
    mockGetLesson.mockReturnValue(lesson('L1.1', steps));

    const due = steps.map((s) => dueRow({ item_id: s.id }));
    expect(buildReviewItems(due)).toHaveLength(5);
    // An explicit limit is honoured too.
    expect(buildReviewItems(due, 3)).toHaveLength(3);
  });

  it('drops a row whose lesson no longer exists', () => {
    mockGetLesson.mockReturnValue(undefined);
    expect(buildReviewItems([dueRow({ item_id: 's1' })])).toEqual([]);
  });

  it('drops a row whose step no longer exists in the lesson', () => {
    mockGetLesson.mockReturnValue(lesson('L1.1', [mcqStep('s1')]));
    // s2 was removed from the lesson since the miss was queued.
    expect(buildReviewItems([dueRow({ item_id: 's2' })])).toEqual([]);
  });
});

describe('gradeReviewAnswer (7.4)', () => {
  it('returns true for a correct re-answer', () => {
    const step = mcqStep('s1', 'a');
    expect(gradeReviewAnswer(step, { stepId: 's1', type: 'mcq', optionId: 'a' })).toBe(true);
  });

  it('returns false for a wrong re-answer', () => {
    const step = mcqStep('s1', 'a');
    expect(gradeReviewAnswer(step, { stepId: 's1', type: 'mcq', optionId: 'b' })).toBe(false);
  });
});

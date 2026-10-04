import {
  buildItemResults,
  parseAssessmentResult,
  type SubmitAssessmentInput,
} from './submit-assessment';
import type { PerItemResult } from '../scoring';

// Importing the module pulls in the Supabase client wiring; mock the native-
// backed storage used transitively so the module loads under Jest. The tests
// only exercise the pure helpers.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const INPUT: SubmitAssessmentInput = {
  lessonId: 'L0',
  form: 'A',
  itemResults: [],
};

describe('buildItemResults (6.2)', () => {
  it('maps the scored per-item breakdown to {item_id, concept, correct}', () => {
    const perItem: PerItemResult[] = [
      { stepId: 'q1', concept: 'money-basics', correct: true, scorePct: 100 },
      { stepId: 'q2', concept: 'risk', correct: false, scorePct: 0 },
    ];
    expect(buildItemResults(perItem)).toEqual([
      { item_id: 'q1', concept: 'money-basics', correct: true },
      { item_id: 'q2', concept: 'risk', correct: false },
    ]);
  });

  it('drops items without a concept tag (defensive — placement items always have one)', () => {
    const perItem: PerItemResult[] = [
      { stepId: 'q1', concept: 'risk', correct: true, scorePct: 100 },
      { stepId: 'q2', concept: undefined, correct: false, scorePct: 0 },
    ];
    expect(buildItemResults(perItem)).toEqual([
      { item_id: 'q1', concept: 'risk', correct: true },
    ]);
  });

  it('returns an empty array for no items', () => {
    expect(buildItemResults([])).toEqual([]);
  });
});

describe('parseAssessmentResult (6.3)', () => {
  it('narrows the returned assessment_results row', () => {
    const result = parseAssessmentResult(
      {
        id: 'uuid',
        user_id: 'u1',
        lesson_id: 'L0',
        form: 'A',
        score_pct: 70,
        item_results: [],
        taken_at: '2025-01-04T00:00:00Z',
      },
      INPUT,
    );
    expect(result).toEqual({ lessonId: 'L0', form: 'A', scorePct: 70 });
  });

  it('parses a numeric(5,2) score surfaced as a string', () => {
    const result = parseAssessmentResult({ lesson_id: 'L0', form: 'A', score_pct: '66.67' }, INPUT);
    expect(result.scorePct).toBeCloseTo(66.67);
  });

  it('falls back to the request lesson id and form when the row omits them', () => {
    const result = parseAssessmentResult({}, { lessonId: 'L0', form: 'B', itemResults: [] });
    expect(result).toEqual({ lessonId: 'L0', form: 'B', scorePct: 0 });
  });

  it('defaults a non-numeric / missing score to 0 (never throws)', () => {
    expect(parseAssessmentResult({ score_pct: 'nope' }, INPUT).scorePct).toBe(0);
    expect(parseAssessmentResult(null, INPUT).scorePct).toBe(0);
    expect(parseAssessmentResult(undefined, INPUT).scorePct).toBe(0);
  });
});

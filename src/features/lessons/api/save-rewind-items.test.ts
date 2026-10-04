import { buildRewindItems, saveRewindItems } from './save-rewind-items';
import type { PerItemResult } from '../scoring';

// Importing the module pulls in the Supabase client wiring; stub the native-
// backed storage so the module loads under Jest. These tests exercise only the
// pure builder (no network).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('buildRewindItems (7.1)', () => {
  it('keeps only the incorrect scored items, keyed to {lesson_id, item_id}', () => {
    const perItem: PerItemResult[] = [
      { stepId: 's1', concept: 'ownership', correct: true, scorePct: 100 },
      { stepId: 's2', concept: 'dilution', correct: false, scorePct: 0 },
      { stepId: 's3', concept: 'risk', correct: false, scorePct: 0 },
    ];
    expect(buildRewindItems(perItem, 'L1.1')).toEqual([
      { lesson_id: 'L1.1', item_id: 's2' },
      { lesson_id: 'L1.1', item_id: 's3' },
    ]);
  });

  it('returns an empty array when every scored item was correct', () => {
    const perItem: PerItemResult[] = [
      { stepId: 's1', concept: 'ownership', correct: true, scorePct: 100 },
      { stepId: 's2', concept: 'dilution', correct: true, scorePct: 100 },
    ];
    expect(buildRewindItems(perItem, 'L1.1')).toEqual([]);
  });

  it('returns an empty array for a lesson with no scored items', () => {
    expect(buildRewindItems([], 'L1.1')).toEqual([]);
  });

  it('includes a partially-scored sim item (score < 100) as a miss', () => {
    // A graded sim scoring below 100 is marked incorrect by the scorer, so it is
    // a miss worth re-practising.
    const perItem: PerItemResult[] = [
      { stepId: 'sim1', concept: 'dilution', correct: false, scorePct: 60 },
    ];
    expect(buildRewindItems(perItem, 'L1.1')).toEqual([
      { lesson_id: 'L1.1', item_id: 'sim1' },
    ]);
  });
});

describe('saveRewindItems short-circuit (7.1)', () => {
  it('returns 0 for an empty list without reaching the Supabase client', async () => {
    // `saveRewindItems` short-circuits before its lazy supabase import, which
    // would otherwise pull in the native client under Jest; an empty list is a
    // no-op that returns 0.
    await expect(saveRewindItems([])).resolves.toBe(0);
  });
});

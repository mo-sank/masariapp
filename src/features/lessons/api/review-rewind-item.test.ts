import { parseRewindReview } from './review-rewind-item';

// Importing the module pulls in the Supabase client wiring; stub the native-
// backed storage so the module loads under Jest. These tests exercise only the
// pure parser (no network).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('parseRewindReview (7.4)', () => {
  it('narrows the updated rewind_items row to {itemId, box}', () => {
    const result = parseRewindReview(
      {
        id: 'uuid',
        user_id: 'u1',
        lesson_id: 'L1.1',
        item_id: 's2',
        box: 2,
        due_at: '2025-01-10T00:00:00Z',
        last_seen_at: '2025-01-04T00:00:00Z',
      },
      's2',
    );
    expect(result).toEqual({ itemId: 's2', box: 2 });
  });

  it('falls back to the reviewed item id when the row omits it', () => {
    expect(parseRewindReview({ box: 0 }, 's9')).toEqual({ itemId: 's9', box: 0 });
  });

  it('defaults a missing / non-numeric box to 0 and never throws', () => {
    expect(parseRewindReview({ item_id: 's1', box: 'nope' }, 's1').box).toBe(0);
    expect(parseRewindReview(null, 's1')).toEqual({ itemId: 's1', box: 0 });
    expect(parseRewindReview(undefined, 's1')).toEqual({ itemId: 's1', box: 0 });
  });
});

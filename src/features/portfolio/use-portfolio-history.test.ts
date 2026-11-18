// Mock the Supabase singleton so importing use-portfolio-history does not pull
// in the native auth0 module chain (mirrors use-bars.test.ts). This test
// exercises only the pure rangeCutoffDate helper.
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { rangeCutoffDate } from './use-portfolio-history';

describe('rangeCutoffDate', () => {
  // A fixed UTC reference instant keeps the cutoff deterministic regardless of
  // the ET/UTC drift the helper deliberately accepts (design §4). Expectations
  // are derived from the RANGE_DAYS constants (now - N days), not a calendar
  // "N months/years ago".
  const now = new Date('2025-06-15T12:00:00.000Z');

  it('counts back the right span for each non-ALL range', () => {
    expect(rangeCutoffDate('1M', now)).toBe('2025-05-15');
    expect(rangeCutoffDate('3M', now)).toBe('2025-03-14');
    expect(rangeCutoffDate('1Y', now)).toBe('2024-06-14');
    expect(rangeCutoffDate('5Y', now)).toBe('2020-06-14');
  });

  it('returns null for ALL (no cutoff filter)', () => {
    expect(rangeCutoffDate('ALL', now)).toBeNull();
  });

  it('returns an inclusive YYYY-MM-DD cutoff for a non-ALL range', () => {
    expect(rangeCutoffDate('1M', now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

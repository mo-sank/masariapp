// Mock the Supabase singleton so importing use-bars does not pull in the native
// auth0 module chain (see src/features/auth/api/create-profile.test.ts). This
// test exercises only the pure rangeCutoffDate helper.
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { rangeCutoffDate } from './use-bars';

describe('rangeCutoffDate', () => {
  // A fixed reference date keeps the cutoff deterministic.
  const now = new Date('2025-06-15T12:00:00.000Z');

  it('counts back the right span for each range', () => {
    expect(rangeCutoffDate('1M', now)).toBe('2025-05-15');
    expect(rangeCutoffDate('3M', now)).toBe('2025-03-14');
    expect(rangeCutoffDate('1Y', now)).toBe('2024-06-14');
    expect(rangeCutoffDate('5Y', now)).toBe('2020-06-14');
  });

  it('returns an inclusive YYYY-MM-DD cutoff', () => {
    expect(rangeCutoffDate('1M', now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

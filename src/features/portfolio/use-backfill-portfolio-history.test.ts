// Mock the Supabase singleton so importing use-backfill-portfolio-history does
// not pull in native modules. These tests exercise only the pure
// mapBackfillError mapper and the backfillResultSchema parse (mirrors
// use-place-order.test.ts / use-run-simulation.test.ts).
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above imports
import { backfillResultSchema, mapBackfillError } from './use-backfill-portfolio-history';

describe('mapBackfillError', () => {
  it('maps not_authenticated to a sign-in message', () => {
    expect(mapBackfillError(new Error('not_authenticated'))).toMatch(/sign in/i);
  });

  it('maps no_account to a paper-account message', () => {
    expect(mapBackfillError(new Error('no_account'))).toMatch(/paper account/i);
  });

  it('trims surrounding whitespace on the error code before matching', () => {
    expect(mapBackfillError(new Error('  no_account  '))).toMatch(/paper account/i);
  });

  it('reads the code from a plain error-shaped object (PostgREST error)', () => {
    expect(mapBackfillError({ message: 'not_authenticated', code: 'P0001' })).toMatch(/sign in/i);
  });

  it('falls back to generic copy for an unknown error', () => {
    expect(mapBackfillError(new Error('boom'))).toMatch(/try again/i);
  });

  it('falls back to generic copy for a non-error value', () => {
    expect(mapBackfillError(null)).toMatch(/try again/i);
    expect(mapBackfillError(undefined)).toMatch(/try again/i);
    expect(mapBackfillError('no_account')).toMatch(/try again/i);
  });
});

describe('backfillResultSchema', () => {
  it('accepts a non-negative integer row count', () => {
    expect(backfillResultSchema.parse(0)).toBe(0);
    expect(backfillResultSchema.parse(42)).toBe(42);
  });

  it('rejects a negative count', () => {
    expect(() => backfillResultSchema.parse(-1)).toThrow();
  });

  it('rejects a non-integer', () => {
    expect(() => backfillResultSchema.parse(1.5)).toThrow();
  });

  it('rejects a non-number', () => {
    expect(() => backfillResultSchema.parse('5')).toThrow();
    expect(() => backfillResultSchema.parse(null)).toThrow();
  });
});

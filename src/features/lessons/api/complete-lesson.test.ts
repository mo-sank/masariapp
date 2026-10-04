import { parseCompletionResult } from './complete-lesson';

// Importing the module pulls in the Supabase client wiring; mock the native-
// backed storage used transitively so the module loads under Jest. The tests
// only exercise the pure parser.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('parseCompletionResult', () => {
  it('parses a passing first-completion result (5.4)', () => {
    const result = parseCompletionResult({
      passed: true,
      first_completion: true,
      xp_awarded: 15,
      streak: 3,
      streak_freezes: 1,
      unlocked: ['explore'],
    });
    expect(result).toEqual({
      passed: true,
      firstCompletion: true,
      xpAwarded: 15,
      streak: 3,
      streakFreezes: 1,
      unlocked: ['explore'],
    });
  });

  it('parses a replay (first_completion false) with no XP or unlocks (5.6)', () => {
    const result = parseCompletionResult({
      passed: true,
      first_completion: false,
      xp_awarded: 0,
      streak: 4,
      streak_freezes: 1,
      unlocked: [],
    });
    expect(result).toMatchObject({
      passed: true,
      firstCompletion: false,
      xpAwarded: 0,
      unlocked: [],
    });
  });

  it('parses a sub-pass result (5.3)', () => {
    const result = parseCompletionResult({ passed: false, xp_awarded: 0, unlocked: [] });
    expect(result).toEqual({ passed: false, xpAwarded: 0, unlocked: [] });
  });

  it('treats a missing passed flag as a sub-pass (defensive)', () => {
    expect(parseCompletionResult({})).toEqual({ passed: false, xpAwarded: 0, unlocked: [] });
    expect(parseCompletionResult(null)).toEqual({ passed: false, xpAwarded: 0, unlocked: [] });
    expect(parseCompletionResult(undefined)).toEqual({
      passed: false,
      xpAwarded: 0,
      unlocked: [],
    });
  });

  it('defaults missing/non-numeric fields and filters non-string unlocks', () => {
    const result = parseCompletionResult({
      passed: true,
      // first_completion omitted -> false
      xp_awarded: 'nope',
      streak: null,
      unlocked: ['explore', 42, null, 'portfolio'],
    });
    expect(result).toEqual({
      passed: true,
      firstCompletion: false,
      xpAwarded: 0,
      streak: 0,
      streakFreezes: 0,
      unlocked: ['explore', 'portfolio'],
    });
  });
});

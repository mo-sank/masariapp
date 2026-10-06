import { render } from '@testing-library/react-native';

/**
 * useUnlock behaviour (requirements 1.3, 1.5).
 *
 * The hook turns the shared `user_unlocks` query into a single feature's
 * verdict. These tests pin the behaviour that matters for gating:
 *   - a feature is unlocked only when the query has succeeded AND the key is
 *     present (fail closed on loading and error),
 *   - the reported `unlockLesson` is the lesson that grants the feature so a
 *     LockedState can link to it (requirement 1.5).
 *
 * `renderHook` is unreliable under this jest-expo setup (see
 * `src/lib/auth0.test.tsx`), so the hook is driven through a throwaway
 * component that captures its result.
 */

// Control the backing user_unlocks query state per test.
type UnlocksQuery = {
  data?: { feature_key: string }[];
  isSuccess: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
let mockQuery: UnlocksQuery;
jest.mock('../../lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => mockQuery,
}));

// Lesson content: a known title for the unlocking lesson.
jest.mock('../../lessons/content', () => ({
  getLesson: (id: string) => (id === 'L1.4' ? { title: 'Your First Trade' } : undefined),
}));

// eslint-disable-next-line import/first -- after mocks
import { useUnlock, type UnlockState } from './use-unlock';

async function captureUnlock(
  feature: Parameters<typeof useUnlock>[0],
  enabled = true,
): Promise<UnlockState> {
  let captured: UnlockState | undefined;
  function Probe() {
    captured = useUnlock(feature, enabled);
    return null;
  }
  await render(<Probe />);
  if (!captured) {
    throw new Error('useUnlock did not run');
  }
  return captured;
}

function successWith(keys: string[]): UnlocksQuery {
  return {
    data: keys.map((feature_key) => ({ feature_key })),
    isSuccess: true,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

describe('useUnlock (1.3, 1.5)', () => {
  it('reports unlocked when the query succeeded and holds the key', async () => {
    mockQuery = successWith(['explore', 'portfolio']);
    const result = await captureUnlock('portfolio');
    expect(result.unlocked).toBe(true);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
  });

  it('reports locked when the key is absent from a successful result', async () => {
    mockQuery = successWith(['explore']);
    expect((await captureUnlock('portfolio')).unlocked).toBe(false);
  });

  it('fails closed while loading (unlocked is false)', async () => {
    mockQuery = {
      data: undefined,
      isSuccess: false,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    };
    const result = await captureUnlock('portfolio');
    expect(result.unlocked).toBe(false);
    expect(result.isLoading).toBe(true);
  });

  it('fails closed on error and surfaces the error flag', async () => {
    mockQuery = {
      data: undefined,
      isSuccess: false,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    };
    const result = await captureUnlock('portfolio');
    expect(result.unlocked).toBe(false);
    expect(result.isError).toBe(true);
  });

  it('names the lesson that unlocks the feature (1.5)', async () => {
    mockQuery = successWith([]);
    const result = await captureUnlock('market_buy');
    expect(result.unlockLesson).toEqual({ id: 'L1.4', title: 'Your First Trade' });
  });

  it('exposes a null title when the unlocking lesson is not bundled', async () => {
    mockQuery = successWith([]);
    // `daily_briefing` -> B1, which the content mock does not know about.
    const result = await captureUnlock('daily_briefing');
    expect(result.unlockLesson.id).toBe('B1');
    expect(result.unlockLesson.title).toBeNull();
  });
});

import { render } from '@testing-library/react-native';

/**
 * useRank behaviour (requirements 3.2, 3.4).
 *
 * The hook turns the shared `['lesson-progress']` query into the learner's rank:
 * keep completed lessons the catalog marks as bosses, then apply the pure rank
 * rule. These tests pin that only completed *boss* lessons promote the rank, and
 * that loading/error fail safe to the default rank.
 *
 * `renderHook` is unreliable under this jest-expo setup (see `use-unlock.test`),
 * so the hook is driven through a throwaway component that captures its result.
 */

// Control the backing lesson-progress query state per test.
type ProgressQuery = {
  data?: { lesson_id: string; status: string }[];
  isLoading: boolean;
  isError: boolean;
};
let mockQuery: ProgressQuery;
jest.mock('../../lessons/hooks/use-lesson-progress', () => ({
  useLessonProgress: () => mockQuery,
}));

// Catalog: B1 is the only boss among a few lessons.
jest.mock('../../lessons/content', () => ({
  listLessons: () => [
    { id: 'L1.4', kind: 'lesson' },
    { id: 'B1', kind: 'boss' },
    { id: 'L2.1', kind: 'lesson' },
  ],
}));

// eslint-disable-next-line import/first -- after mocks
import { useRank, type RankState } from './use-rank';

async function captureRank(enabled = true): Promise<RankState> {
  let captured: RankState | undefined;
  function Probe() {
    captured = useRank(enabled);
    return null;
  }
  await render(<Probe />);
  if (!captured) {
    throw new Error('useRank did not run');
  }
  return captured;
}

function loaded(rows: { lesson_id: string; status: string }[]): ProgressQuery {
  return { data: rows, isLoading: false, isError: false };
}

describe('useRank (3.2, 3.4)', () => {
  it('is Newcomer with no completed bosses', async () => {
    mockQuery = loaded([{ lesson_id: 'L1.4', status: 'completed' }]);
    expect((await captureRank()).rank).toBe('Newcomer');
  });

  it('is Rookie once B1 is completed', async () => {
    mockQuery = loaded([
      { lesson_id: 'L1.4', status: 'completed' },
      { lesson_id: 'B1', status: 'completed' },
    ]);
    expect((await captureRank()).rank).toBe('Rookie');
  });

  it('does not promote on an in-progress boss (only completed bosses count)', async () => {
    mockQuery = loaded([{ lesson_id: 'B1', status: 'in_progress' }]);
    expect((await captureRank()).rank).toBe('Newcomer');
  });

  it('fails safe to the default rank while loading', async () => {
    mockQuery = { data: undefined, isLoading: true, isError: false };
    const result = await captureRank();
    expect(result.rank).toBe('Newcomer');
    expect(result.isLoading).toBe(true);
  });

  it('fails safe to the default rank on error', async () => {
    mockQuery = { data: undefined, isLoading: false, isError: true };
    const result = await captureRank();
    expect(result.rank).toBe('Newcomer');
    expect(result.isError).toBe(true);
  });
});

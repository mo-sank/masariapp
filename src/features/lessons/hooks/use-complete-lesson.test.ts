import { QueryClient } from '@tanstack/react-query';

import { invalidateLearningQueries, runCompletion } from './use-complete-lesson';
import { LESSON_PROGRESS_QUERY_KEY } from './use-lesson-progress';
import { STATS_QUERY_KEY } from './use-stats';
import { UNLOCKS_QUERY_KEY } from './use-unlocks';
import type { CompleteLessonInput, CompletionResult } from '../api/complete-lesson';

// Importing the hook module pulls in the completion-queue singleton
// (AsyncStorage) and, via the sibling query hooks, the Supabase client (which
// reaches native Auth0 and reads config). Stub those so the file loads; the
// tests exercise the pure helpers with injected deps and never hit a real
// client, cache, or network.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-auth0', () => ({
  __esModule: true,
  default: class {},
  Auth0Provider: ({ children }: { children: unknown }) => children,
  useAuth0: () => ({}),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: jest.fn(), from: jest.fn() }),
}));
jest.mock('../../../lib/config', () => ({
  config: {
    auth0Domain: 'example.us.auth0.com',
    auth0ClientId: 'client-abc',
    auth0Audience: 'https://api.example.app',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
  },
}));

const INPUT: CompleteLessonInput = {
  lessonId: 'L1.1',
  scorePct: 80,
  durationMs: 1000,
  answers: [{ stepId: 's1', concept: 'ownership', correct: true }],
};

const PASS: CompletionResult = {
  passed: true,
  firstCompletion: true,
  xpAwarded: 10,
  streak: 1,
  streakFreezes: 0,
  unlocked: ['explore'],
};

describe('runCompletion (5.5)', () => {
  it('returns the parsed result on success and does not enqueue', async () => {
    const run = jest.fn(async () => PASS);
    const enqueue = jest.fn(async () => {});

    const result = await runCompletion(INPUT, run, { enqueue });

    expect(result).toEqual(PASS);
    expect(run).toHaveBeenCalledWith(INPUT);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues the completion and rethrows when the RPC fails (never lose)', async () => {
    const run = jest.fn(async () => {
      throw new Error('offline');
    });
    const enqueue = jest.fn(async () => {});

    await expect(runCompletion(INPUT, run, { enqueue })).rejects.toThrow('offline');
    // Never lose the result: it was enqueued for retry.
    expect(enqueue).toHaveBeenCalledWith(INPUT);
  });
});

describe('invalidateLearningQueries (2.5)', () => {
  it('invalidates the progress, stats, and unlocks queries', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());

    invalidateLearningQueries(client);

    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual([LESSON_PROGRESS_QUERY_KEY, STATS_QUERY_KEY, UNLOCKS_QUERY_KEY]);
    client.clear();
  });
});

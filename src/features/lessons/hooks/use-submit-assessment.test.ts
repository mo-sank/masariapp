import { QueryClient } from '@tanstack/react-query';

import { invalidateLearningQueries } from './use-submit-assessment';
import { LESSON_PROGRESS_QUERY_KEY } from './use-lesson-progress';
import { STATS_QUERY_KEY } from './use-stats';
import { UNLOCKS_QUERY_KEY } from './use-unlocks';

// Importing the hook module reaches the Supabase client (via the sibling query
// hooks) and AsyncStorage transitively. Stub those so the file loads; the test
// exercises the pure invalidation helper and never hits a real client.
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

describe('invalidateLearningQueries (6.4, 2.5)', () => {
  it('invalidates the progress, stats, and unlocks queries so the path refreshes', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());

    invalidateLearningQueries(client);

    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual([LESSON_PROGRESS_QUERY_KEY, STATS_QUERY_KEY, UNLOCKS_QUERY_KEY]);
    client.clear();
  });
});

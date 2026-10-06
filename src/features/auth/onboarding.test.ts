// onboarding.ts imports CreateProfileError from the api wrapper, whose import
// chain reaches the Supabase and Auth0 clients (native modules). Stub them so
// this pure-logic test can import the orchestration without a device.
jest.mock('react-native-auth0', () => ({
  __esModule: true,
  default: class {},
  Auth0Provider: ({ children }: { children: unknown }) => children,
  useAuth0: () => ({}),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: jest.fn() }),
}));
jest.mock('../../lib/config', () => ({
  config: {
    auth0Domain: 'd',
    auth0ClientId: 'c',
    auth0Audience: 'a',
    supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'k',
  },
}));

// eslint-disable-next-line import/first -- jest.mock calls above must be hoisted before these imports
import { CreateProfileError } from './api/create-profile';
// eslint-disable-next-line import/first
import {
  submitOnboarding,
  type OnboardingSubmitInput,
  type OnboardingSubmitDeps,
} from './onboarding';

const input: OnboardingSubmitInput = {
  username: 'Cool_Trader',
  birthMonth: 6,
  birthYear: 2008,
  timezone: 'America/New_York',
  termsVersion: 'v1',
  privacyVersion: 'v1',
};

const profile = {
  age_band: '16-17',
  avatar_key: 'default',
  birth_year: 2008,
  created_at: '2025-01-01T00:00:00Z',
  timezone: 'America/New_York',
  user_id: 'auth0|userA',
  username: 'Cool_Trader',
};

/** Build deps with a stubbed createProfile. */
function makeDeps(createProfile: OnboardingSubmitDeps['createProfile']): OnboardingSubmitDeps {
  return { createProfile };
}

describe('submitOnboarding', () => {
  it('returns success with the profile on the first try', async () => {
    const createProfile = jest.fn().mockResolvedValue(profile);
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'success', profile });
    expect(createProfile).toHaveBeenCalledTimes(1);
    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Cool_Trader' }),
    );
  });

  it('surfaces username_taken WITHOUT changing the typed name and without retrying', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('username_taken'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'username_taken' });
    // The user owns the name now, so there is exactly ONE attempt — never a
    // silent regenerate-and-retry.
    expect(createProfile).toHaveBeenCalledTimes(1);
    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Cool_Trader' }),
    );
  });

  it('classifies under_min_age so the screen can block + log out (5.6)', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('under_min_age'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'under_min_age' });
    expect(createProfile).toHaveBeenCalledTimes(1);
  });

  it('surfaces invalid_username distinctly (server validator rejected the name)', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('invalid_username'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'invalid_username' });
    expect(createProfile).toHaveBeenCalledTimes(1);
  });

  it('reports a generic error for an unexpected failure', async () => {
    const boom = new Error('network down');
    const createProfile = jest.fn().mockRejectedValue(boom);
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'error', error: boom });
  });

  it('reports a generic error for not_authenticated', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('not_authenticated'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result.kind).toBe('error');
  });
});

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
  username: 'cool-fox-77',
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
  username: 'cool-fox-77',
};

/** Build deps with a stubbed createProfile and a generator returning fixed names. */
function makeDeps(
  createProfile: OnboardingSubmitDeps['createProfile'],
  retryName = 'brave-owl-42',
): OnboardingSubmitDeps {
  return { createProfile, generateUsername: jest.fn(() => retryName) };
}

describe('submitOnboarding', () => {
  it('returns success with the profile on the first try', async () => {
    const createProfile = jest.fn().mockResolvedValue(profile);
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'success', profile });
    expect(createProfile).toHaveBeenCalledTimes(1);
    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'cool-fox-77' }),
    );
  });

  it('retries once with a new username after username_taken, then succeeds (5.5)', async () => {
    const createProfile = jest
      .fn()
      .mockRejectedValueOnce(new CreateProfileError('username_taken'))
      .mockResolvedValueOnce(profile);
    const deps = makeDeps(createProfile, 'brave-owl-42');

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'success', profile });
    expect(createProfile).toHaveBeenCalledTimes(2);
    // Second attempt uses the regenerated username.
    expect(createProfile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ username: 'brave-owl-42' }),
    );
    expect(deps.generateUsername).toHaveBeenCalledTimes(1);
  });

  it('gives up with username_taken when the retry is also taken (5.5)', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('username_taken'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'username_taken' });
    // Exactly two attempts: original + one retry. Never a third.
    expect(createProfile).toHaveBeenCalledTimes(2);
  });

  it('classifies under_min_age so the screen can block + log out (5.6)', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('under_min_age'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'under_min_age' });
    expect(createProfile).toHaveBeenCalledTimes(1);
  });

  it('surfaces under_min_age discovered on the retry attempt', async () => {
    const createProfile = jest
      .fn()
      .mockRejectedValueOnce(new CreateProfileError('username_taken'))
      .mockRejectedValueOnce(new CreateProfileError('under_min_age'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'under_min_age' });
  });

  it('reports a generic error for an unexpected failure', async () => {
    const boom = new Error('network down');
    const createProfile = jest.fn().mockRejectedValue(boom);
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result).toEqual({ kind: 'error', error: boom });
  });

  it('reports a generic error for a non-retryable typed code (invalid_username)', async () => {
    const createProfile = jest.fn().mockRejectedValue(new CreateProfileError('invalid_username'));
    const deps = makeDeps(createProfile);

    const result = await submitOnboarding(input, deps);

    expect(result.kind).toBe('error');
  });
});

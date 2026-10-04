// Mock the Supabase singleton so the wrapper can be tested without a client or
// native modules. The module under test imports `supabase` from src/lib and
// calls `.rpc('create_profile', ...)`.
const mockRpc = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import {
  createProfile,
  CreateProfileError,
  mapErrorMessage,
  type CreateProfileArgs,
} from './create-profile';

const args: CreateProfileArgs = {
  username: 'cool-fox-77',
  birthYear: 2008,
  birthMonth: 6,
  timezone: 'America/New_York',
  termsVersion: 'v1',
  privacyVersion: 'v1',
};

const profileRow = {
  age_band: '16-17',
  avatar_key: 'default',
  birth_year: 2008,
  created_at: '2025-01-01T00:00:00Z',
  timezone: 'America/New_York',
  user_id: 'auth0|userA',
  username: 'cool-fox-77',
};

beforeEach(() => {
  mockRpc.mockReset();
});

describe('mapErrorMessage', () => {
  it('recognizes each known code', () => {
    expect(mapErrorMessage('under_min_age')).toBe('under_min_age');
    expect(mapErrorMessage('username_taken')).toBe('username_taken');
    expect(mapErrorMessage('invalid_username')).toBe('invalid_username');
    expect(mapErrorMessage('not_authenticated')).toBe('not_authenticated');
  });

  it('matches a code embedded in a longer Postgres message', () => {
    expect(mapErrorMessage('ERROR: username_taken (SQLSTATE P0001)')).toBe('username_taken');
  });

  it('returns undefined for an unrecognized or empty message', () => {
    expect(mapErrorMessage('some other failure')).toBeUndefined();
    expect(mapErrorMessage(undefined)).toBeUndefined();
    expect(mapErrorMessage('')).toBeUndefined();
  });
});

describe('createProfile', () => {
  it('passes the RPC the p_-prefixed arguments and returns the profile', async () => {
    mockRpc.mockResolvedValue({ data: profileRow, error: null });

    const result = await createProfile(args);

    expect(result).toEqual(profileRow);
    expect(mockRpc).toHaveBeenCalledWith('create_profile', {
      p_username: 'cool-fox-77',
      p_birth_year: 2008,
      p_birth_month: 6,
      p_timezone: 'America/New_York',
      p_terms_version: 'v1',
      p_privacy_version: 'v1',
    });
  });

  it('throws a typed CreateProfileError for a known RPC error (username_taken)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'username_taken' } });

    await expect(createProfile(args)).rejects.toMatchObject({
      name: 'CreateProfileError',
      code: 'username_taken',
    });
  });

  it('maps under_min_age to a typed error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'under_min_age' } });

    const err = await createProfile(args).catch((e) => e);
    expect(err).toBeInstanceOf(CreateProfileError);
    expect(err.code).toBe('under_min_age');
  });

  it('rethrows an unrecognized error unchanged', async () => {
    const raw = { message: 'network down', code: 'XYZ' };
    mockRpc.mockResolvedValue({ data: null, error: raw });

    const err = await createProfile(args).catch((e) => e);
    expect(err).toBe(raw);
    expect(err).not.toBeInstanceOf(CreateProfileError);
  });
});

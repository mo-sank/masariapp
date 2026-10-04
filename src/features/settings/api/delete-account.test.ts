// Mock the Auth0 token source and the config singleton so the wrapper can be
// tested without native modules or a real environment. The module under test
// reads the current token via `getIdTokenSafe` and the Supabase URL/anon key
// from `config`. It sends the Auth0 ID token (the same JWT Supabase consumes),
// not an access token, so the Edge Function can verify it against the Auth0
// client id without the app requesting an API audience at login.
const mockGetIdTokenSafe = jest.fn();
jest.mock('../../../lib/auth0', () => ({
  getIdTokenSafe: () => mockGetIdTokenSafe(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-publishable-key',
  },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { deleteAccount, deleteAccountUrl, DeleteAccountError } from './delete-account';

const mockFetch = jest.fn();

beforeEach(() => {
  mockGetIdTokenSafe.mockReset();
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

describe('deleteAccountUrl', () => {
  it('builds the function URL from the project URL', () => {
    expect(deleteAccountUrl('https://project.supabase.co')).toBe(
      'https://project.supabase.co/functions/v1/delete-account',
    );
  });

  it('does not produce a double slash when the URL has a trailing slash', () => {
    expect(deleteAccountUrl('https://project.supabase.co/')).toBe(
      'https://project.supabase.co/functions/v1/delete-account',
    );
  });
});

describe('deleteAccount', () => {
  it('POSTs the Auth0 ID token as the bearer token with the apikey, and resolves on 204', async () => {
    mockGetIdTokenSafe.mockResolvedValue('id-token-xyz');
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    await expect(deleteAccount()).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/functions/v1/delete-account');
    expect(init.method).toBe('POST');
    // The Authorization header carries the Auth0 ID token (what getIdTokenSafe
    // returns), the same JWT Supabase consumes — not an access token.
    expect(init.headers.Authorization).toBe('Bearer id-token-xyz');
    expect(init.headers.apikey).toBe('anon-publishable-key');
    // Requirement 8.5: no user id is sent; the function reads it from the token.
    expect(init.body).toBeUndefined();
  });

  it('throws a non-retryable not_authenticated error when there is no token', async () => {
    mockGetIdTokenSafe.mockResolvedValue(null);

    const err = await deleteAccount().catch((e) => e);
    expect(err).toBeInstanceOf(DeleteAccountError);
    expect(err.code).toBe('not_authenticated');
    expect(err.retryable).toBe(false);
    // The request is never attempted without a token.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws a retryable network error when fetch rejects', async () => {
    mockGetIdTokenSafe.mockResolvedValue('id-token-xyz');
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    const err = await deleteAccount().catch((e) => e);
    expect(err).toBeInstanceOf(DeleteAccountError);
    expect(err.code).toBe('network');
    expect(err.retryable).toBe(true);
  });

  it('throws a retryable server error for a non-2xx response (8.4 partial delete)', async () => {
    mockGetIdTokenSafe.mockResolvedValue('id-token-xyz');
    // 502: Supabase delete succeeded but the Auth0 Management API delete failed.
    mockFetch.mockResolvedValue({ ok: false, status: 502 });

    const err = await deleteAccount().catch((e) => e);
    expect(err).toBeInstanceOf(DeleteAccountError);
    expect(err.code).toBe('server');
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(502);
  });

  it('completes on a retry after a prior server failure (idempotent)', async () => {
    mockGetIdTokenSafe.mockResolvedValue('id-token-xyz');
    // First call fails with a server error, retry succeeds.
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await expect(deleteAccount()).rejects.toBeInstanceOf(DeleteAccountError);
    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

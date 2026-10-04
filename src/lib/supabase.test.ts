// Capture the options passed to createClient so we can assert the accessToken
// callback and the disabled GoTrue session options.
const mockCreateClient = jest.fn(() => ({ from: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...(args as [])),
}));

// Mock the standalone token getter from auth0.
const mockGetAccessTokenSafe = jest.fn();
jest.mock('./auth0', () => ({
  getAccessTokenSafe: () => mockGetAccessTokenSafe(),
}));

jest.mock('./config', () => ({
  config: {
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
  },
}));

type CreateClientOptions = {
  accessToken: () => Promise<string | null>;
  auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean };
};

function getOptions(): CreateClientOptions {
  // Load the module after mocks are set up; it creates the client at import
  // time, and jest.resetModules() between tests forces a fresh evaluation, so a
  // runtime require (not a static import) is required here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./supabase');
  const call = mockCreateClient.mock.calls[0] as unknown[];
  return call[2] as CreateClientOptions;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('supabase client', () => {
  it('is created with the configured url and anon key', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./supabase');
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const call = mockCreateClient.mock.calls[0] as unknown[];
    expect(call[0]).toBe('https://project.supabase.co');
    expect(call[1]).toBe('anon-key');
  });

  it('disables Supabase GoTrue session management (Auth0 owns identity)', () => {
    const options = getOptions();
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it('accessToken callback returns the current Auth0 token', async () => {
    mockGetAccessTokenSafe.mockResolvedValue('access-token-xyz');
    const options = getOptions();
    await expect(options.accessToken()).resolves.toBe('access-token-xyz');
  });

  it('accessToken callback returns null when signed out', async () => {
    mockGetAccessTokenSafe.mockResolvedValue(null);
    const options = getOptions();
    await expect(options.accessToken()).resolves.toBeNull();
  });
});

import { render } from '@testing-library/react-native';

import { useSession, type Session } from './auth0';

// Mock the config so the hook has a stable domain/clientId/audience without
// touching real environment variables.
jest.mock('./config', () => ({
  config: {
    auth0Domain: 'masari.us.auth0.com',
    auth0ClientId: 'client-abc123',
    auth0Audience: 'https://api.masari.app',
  },
}));

// Mock react-native-auth0's hook. Jest hoists the factory above imports, so the
// shared mocks must be reachable from inside it: variables prefixed with `mock`
// are the only out-of-scope references jest allows.
const mockAuth0 = {
  authorize: jest.fn(),
  clearSession: jest.fn(),
  clearCredentials: jest.fn(),
  getCredentials: jest.fn(),
};

let mockState: {
  user: unknown;
  isLoading: boolean;
};

jest.mock('react-native-auth0', () => ({
  // AuthProvider only wraps this; it is not exercised in these logic tests.
  Auth0Provider: ({ children }: { children: unknown }) => children,
  useAuth0: () => ({
    user: mockState.user,
    isLoading: mockState.isLoading,
    authorize: mockAuth0.authorize,
    clearSession: mockAuth0.clearSession,
    clearCredentials: mockAuth0.clearCredentials,
    getCredentials: mockAuth0.getCredentials,
  }),
}));

const { authorize, clearSession, clearCredentials, getCredentials } = mockAuth0;

// Render a throwaway component that calls the hook and hands the resulting
// session back to the test. A plain renderHook does not work under this
// jest-expo setup, so drive the hook through a rendered component instead.
async function getSession(): Promise<Session> {
  let captured: Session | undefined;
  function Harness() {
    captured = useSession();
    return null;
  }
  await render(<Harness />);
  if (!captured) {
    throw new Error('useSession did not run');
  }
  return captured;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { user: null, isLoading: false };
});

describe('useSession', () => {
  it('reports signed-out when there is no user', async () => {
    mockState = { user: null, isLoading: false };
    const session = await getSession();
    expect(session.isSignedIn).toBe(false);
    expect(session.isLoading).toBe(false);
  });

  it('reports signed-in when a user is present', async () => {
    mockState = { user: { sub: 'auth0|123' }, isLoading: false };
    const session = await getSession();
    expect(session.isSignedIn).toBe(true);
  });

  it('passes isLoading through from the SDK', async () => {
    mockState = { user: null, isLoading: true };
    const session = await getSession();
    expect(session.isLoading).toBe(true);
  });

  it('login opens Universal Login with the offline_access scope and no API audience', async () => {
    authorize.mockResolvedValue({ accessToken: 'tok' });
    const session = await getSession();

    await session.login();

    expect(authorize).toHaveBeenCalledTimes(1);
    // No `audience` is passed: Supabase consumes the Auth0 ID token, so the
    // login does not request an access token minted for an API audience.
    expect(authorize).toHaveBeenCalledWith({
      scope: 'openid profile email offline_access',
    });
  });

  it('login rejects when the user cancels Universal Login', async () => {
    const cancel = new Error('a0.session.user_cancelled');
    authorize.mockRejectedValue(cancel);
    const session = await getSession();

    await expect(session.login()).rejects.toThrow(cancel);
  });

  it('logout clears both the web session and the stored credentials', async () => {
    clearSession.mockResolvedValue(undefined);
    clearCredentials.mockResolvedValue(undefined);
    const session = await getSession();

    await session.logout();

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(clearCredentials).toHaveBeenCalledTimes(1);
  });

  it('getAccessToken returns the token from the credentials manager', async () => {
    getCredentials.mockResolvedValue({ accessToken: 'access-token-xyz' });
    const session = await getSession();

    await expect(session.getAccessToken()).resolves.toBe('access-token-xyz');
    expect(getCredentials).toHaveBeenCalledTimes(1);
  });

  it('getAccessToken rejects when no credentials are available', async () => {
    getCredentials.mockResolvedValue(undefined);
    const session = await getSession();

    await expect(session.getAccessToken()).rejects.toThrow(/no auth0 access token/i);
  });

  it('getAccessToken rejects when a silent refresh fails', async () => {
    const refreshError = new Error('RENEW_FAILED');
    getCredentials.mockRejectedValue(refreshError);
    const session = await getSession();

    await expect(session.getAccessToken()).rejects.toThrow(refreshError);
  });

  it('never logs token values', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getCredentials.mockResolvedValue({ accessToken: 'secret-token' });

    const session = await getSession();
    await session.getAccessToken();

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('secret-token');
      }
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

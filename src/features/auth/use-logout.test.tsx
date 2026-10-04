import { render } from '@testing-library/react-native';

import { useLogout } from './use-logout';
import { useOnboardingStore } from './onboarding-store';

// Mock the Auth0 session so logout() does not touch the SDK.
const mockLogout = jest.fn();
jest.mock('../../lib/auth0', () => ({
  useSession: () => ({ logout: mockLogout }),
}));

// Mock the shared query client so we can assert the cache is cleared.
const mockClearQueryCache = jest.fn();
jest.mock('../../lib/query-client', () => ({
  clearQueryCache: () => mockClearQueryCache(),
}));

// Drive the hook through a rendered component (consistent with auth0.test.tsx).
async function getLogout(): Promise<() => Promise<void>> {
  let captured: (() => Promise<void>) | undefined;
  function Harness() {
    captured = useLogout();
    return null;
  }
  await render(<Harness />);
  if (!captured) {
    throw new Error('useLogout did not run');
  }
  return captured;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Seed the onboarding store so we can prove it is reset.
  useOnboardingStore.getState().setBirthDate(5, 2008);
});

describe('useLogout', () => {
  it('clears the Auth0 session, the query cache, and the onboarding store', async () => {
    mockLogout.mockResolvedValue(undefined);
    const logout = await getLogout();

    await logout();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockClearQueryCache).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().birthMonth).toBeNull();
    expect(useOnboardingStore.getState().birthYear).toBeNull();
  });

  it('still clears local state when clearing the Auth0 session fails', async () => {
    mockLogout.mockRejectedValue(new Error('network'));
    const logout = await getLogout();

    // The composed logout rethrows the Auth0 failure, but local state must be
    // cleared regardless so no previous-user data lingers.
    await expect(logout()).rejects.toThrow('network');

    expect(mockClearQueryCache).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().birthMonth).toBeNull();
    expect(useOnboardingStore.getState().birthYear).toBeNull();
  });
});

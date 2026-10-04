import { render } from '@testing-library/react-native';

import { DeleteAccountError } from './api/delete-account';
import { useDeleteAccount } from './use-delete-account';
import { useOnboardingStore } from '../auth/onboarding-store';

// Mock the delete-account API so the hook can be tested without a network call.
const mockDeleteAccount = jest.fn();
jest.mock('./api/delete-account', () => {
  // Keep the real DeleteAccountError class so `instanceof` checks still work.
  const actual = jest.requireActual('./api/delete-account');
  return {
    ...actual,
    deleteAccount: () => mockDeleteAccount(),
  };
});

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

// Mock expo-router so we can assert the post-delete navigation.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

async function getDeleteAccount(): Promise<() => Promise<void>> {
  let captured: (() => Promise<void>) | undefined;
  function Harness() {
    captured = useDeleteAccount();
    return null;
  }
  await render(<Harness />);
  if (!captured) {
    throw new Error('useDeleteAccount did not run');
  }
  return captured;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Seed the onboarding store so we can prove it is reset on success.
  useOnboardingStore.getState().setBirthDate(5, 2008);
});

describe('useDeleteAccount', () => {
  it('deletes, signs out, clears local state, and returns to the age screen', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);

    const run = await getDeleteAccount();
    await run();

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockClearQueryCache).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().birthMonth).toBeNull();
    expect(useOnboardingStore.getState().birthYear).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/age-gate');
  });

  it('does not sign out or navigate when the server delete fails (user can retry)', async () => {
    mockDeleteAccount.mockRejectedValue(new DeleteAccountError('server', true, 502));

    const run = await getDeleteAccount();
    await expect(run()).rejects.toBeInstanceOf(DeleteAccountError);

    // The deletion did not succeed, so the local session must remain intact for
    // a retry (requirement 8.4).
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockClearQueryCache).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().birthMonth).toBe(5);
  });

  it('still clears local state and navigates when the server delete succeeded but sign-out throws', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    mockLogout.mockRejectedValue(new Error('network'));

    const run = await getDeleteAccount();
    // The account is already deleted server-side; sign-out failing must not
    // leave stale local data behind.
    await expect(run()).rejects.toThrow('network');

    expect(mockClearQueryCache).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().birthMonth).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/age-gate');
  });
});

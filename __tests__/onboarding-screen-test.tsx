import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../src/theme/theme-provider';
import type { AvailabilityStatus } from '../src/features/auth/use-username-availability';

// --- Mocks (declared before importing the screen) --------------------------

// Control the live availability status the screen sees.
let mockAvailability: AvailabilityStatus = { kind: 'idle' };
jest.mock('../src/features/auth/use-username-availability', () => ({
  useUsernameAvailability: () => mockAvailability,
}));

// Signed-in session; login is unused in these cases.
jest.mock('../src/lib/auth0', () => ({
  useSession: () => ({ isSignedIn: true, login: jest.fn() }),
}));

// Seed the onboarding store with a birth date so Continue is not blocked by the
// missing-birth-date guard, and provide a no-op username setter.
jest.mock('../src/features/auth/onboarding-store', () => {
  const state = {
    birthMonth: 6,
    birthYear: 2008,
    username: null as string | null,
    setUsername: jest.fn(),
    reset: jest.fn(),
  };
  const useOnboardingStore = (selector: (s: typeof state) => unknown) => selector(state);
  return { useOnboardingStore };
});

// Resolve to a terminal, non-navigating result so onContinue settles
// synchronously (sets an error + clears busy) rather than kicking off the
// success path's async query invalidation, which would otherwise leak pending
// state updates into the next test. The tests only assert whether
// submitOnboarding was called, not the result handling.
const mockSubmit = jest.fn().mockResolvedValue({ kind: 'invalid_username' });
jest.mock('../src/features/auth/onboarding', () => ({
  submitOnboarding: (...args: unknown[]) => mockSubmit(...args),
}));

jest.mock('../src/features/auth/api/create-profile', () => ({
  createProfile: jest.fn(),
  CreateProfileError: class extends Error {},
}));

jest.mock('../src/features/auth/use-age-block', () => ({
  useAgeBlock: () => ({ block: jest.fn() }),
}));
jest.mock('../src/features/auth/use-logout', () => ({
  useLogout: () => jest.fn(),
}));
jest.mock('../src/features/auth/timezone', () => ({
  getDeviceTimezone: () => 'America/New_York',
}));
jest.mock('../src/lib/analytics', () => ({ track: jest.fn() }));

const mockInvalidate = jest.fn().mockResolvedValue(undefined);
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// eslint-disable-next-line import/first -- mocks above must be hoisted before importing the screen
import OnboardingScreen from '../app/(auth)/onboarding';

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <OnboardingScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailability = { kind: 'idle' };
});

// Unmount between tests so a pending render from one test does not leak into
// the next.
afterEach(() => {
  cleanup();
});

describe('<OnboardingScreen />', () => {
  it('offers a username field instead of a generated name + Shuffle', async () => {
    const view = await renderScreen();
    expect(view.getByText('Pick your username')).toBeTruthy();
    expect(view.getByPlaceholderText('e.g. clever_otter')).toBeTruthy();
    expect(view.queryByText('Shuffle')).toBeNull();
  });

  it('disables Continue until the terms are accepted, even when available', async () => {
    mockAvailability = { kind: 'available' };
    const view = await renderScreen();
    expect(view.getByText('✓ Available')).toBeTruthy();
    // Available but terms not accepted: Continue is disabled, so no submit.
    const continueButton = view.getByLabelText('Continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('enables Continue once the name is available AND terms are accepted', async () => {
    mockAvailability = { kind: 'available' };
    const view = await renderScreen();
    // Accept the terms; Continue should then be enabled (the gate the submit
    // path depends on). The async submit itself is covered by the pure
    // submitOnboarding unit tests, so this screen test stops at the gate to stay
    // free of overlapping-act flakiness.
    fireEvent.press(view.getByLabelText('I accept the Terms of Service and Privacy Policy'));
    await waitFor(() =>
      expect(view.getByLabelText('Continue').props.accessibilityState?.disabled).toBe(false),
    );
  });

  it('surfaces a taken username and disables Continue', async () => {
    mockAvailability = { kind: 'taken' };
    const view = await renderScreen();
    expect(view.getByText(/taken/i)).toBeTruthy();
    // A taken name disables Continue regardless of the terms checkbox.
    const continueButton = view.getByLabelText('Continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('surfaces an invalid (format) username and disables Continue', async () => {
    mockAvailability = { kind: 'invalid', reason: 'format' };
    const view = await renderScreen();
    expect(view.getByText(/3–20 letters/i)).toBeTruthy();
    const continueButton = view.getByLabelText('Continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);
  });
});

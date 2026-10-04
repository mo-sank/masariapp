// Mock AsyncStorage: importing auth-gate pulls in use-age-block, which imports
// the native AsyncStorage module. An in-memory stub keeps the import side-effect
// free in the pure-logic tests below.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// auth-gate's import chain reaches the Auth0 and Supabase clients, which load
// native modules. Stub them so the pure routing helpers can be imported without
// a device. These tests exercise only the exported decision functions.
jest.mock('react-native-auth0', () => ({
  __esModule: true,
  default: class {},
  Auth0Provider: ({ children }: { children: unknown }) => children,
  useAuth0: () => ({}),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: jest.fn() }),
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

// SplashScreen is a native module imported at the top of auth-gate; mock it so
// importing the pure helpers under test does not touch native code.
jest.mock('expo-router', () => ({
  SplashScreen: {
    preventAutoHideAsync: jest.fn(() => Promise.resolve()),
    hideAsync: jest.fn(() => Promise.resolve()),
  },
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

// eslint-disable-next-line import/first -- jest.mock calls above must be hoisted before this import of the module under test
import { decideBranch, pathnameToBranch, shouldRedirect } from './auth-gate';

const loaded = {
  ageBlockLoading: false,
  isBlocked: false,
  sessionLoading: false,
  isSignedIn: false,
  profileLoading: false,
  hasProfile: false,
};

describe('decideBranch', () => {
  it('returns null while the device flag is still loading', () => {
    expect(decideBranch({ ...loaded, ageBlockLoading: true })).toBeNull();
  });

  it('returns null while the session is still loading', () => {
    expect(decideBranch({ ...loaded, sessionLoading: true })).toBeNull();
  });

  it('routes a blocked device to age-block even when loaded signed out', () => {
    expect(decideBranch({ ...loaded, isBlocked: true })).toBe('age-block');
  });

  it('a blocked device wins even over a signed-in session with a profile', () => {
    expect(decideBranch({ ...loaded, isBlocked: true, isSignedIn: true, hasProfile: true })).toBe(
      'age-block',
    );
  });

  it('routes a signed-out user to the auth flow', () => {
    expect(decideBranch({ ...loaded, isSignedIn: false })).toBe('auth');
  });

  it('waits (null) for the profile lookup once signed in', () => {
    expect(decideBranch({ ...loaded, isSignedIn: true, profileLoading: true })).toBeNull();
  });

  it('routes a signed-in user without a profile to onboarding', () => {
    expect(decideBranch({ ...loaded, isSignedIn: true, hasProfile: false })).toBe('onboarding');
  });

  it('routes a signed-in user with a profile to the tabs', () => {
    expect(decideBranch({ ...loaded, isSignedIn: true, hasProfile: true })).toBe('tabs');
  });
});

describe('pathnameToBranch', () => {
  it('maps the age-block route', () => {
    expect(pathnameToBranch('/age-block')).toBe('age-block');
  });

  it('maps the onboarding route', () => {
    expect(pathnameToBranch('/onboarding')).toBe('onboarding');
  });

  it('maps age-gate and welcome to the auth branch', () => {
    expect(pathnameToBranch('/age-gate')).toBe('auth');
    expect(pathnameToBranch('/welcome')).toBe('auth');
  });

  it('maps the tab routes to the tabs branch', () => {
    expect(pathnameToBranch('/learn')).toBe('tabs');
    expect(pathnameToBranch('/explore')).toBe('tabs');
    expect(pathnameToBranch('/portfolio')).toBe('tabs');
    expect(pathnameToBranch('/profile')).toBe('tabs');
  });

  it('maps authenticated screens reachable from the tabs to the tabs branch', () => {
    // These are signed-in routes outside the (tabs) group; the gate must not
    // treat navigating to them as a wrong-branch redirect back to the tabs.
    expect(pathnameToBranch('/lesson/L0')).toBe('tabs');
    expect(pathnameToBranch('/lesson/L1.1')).toBe('tabs');
    expect(pathnameToBranch('/lesson/placement')).toBe('tabs');
    expect(pathnameToBranch('/rewind')).toBe('tabs');
    expect(pathnameToBranch('/settings')).toBe('tabs');
  });

  it('returns undefined for an unknown route (e.g. the index placeholder)', () => {
    expect(pathnameToBranch('/')).toBeUndefined();
  });
});

describe('shouldRedirect', () => {
  it('does not redirect when already on the target branch', () => {
    expect(shouldRedirect('tabs', '/learn')).toBe(false);
  });

  it('does not interrupt navigation within the auth branch (age-gate -> welcome)', () => {
    // Target is the auth branch; the user has moved from age-gate to welcome,
    // which is still the auth branch, so the gate leaves them alone.
    expect(shouldRedirect('auth', '/welcome')).toBe(false);
  });

  it('redirects when on a different branch', () => {
    expect(shouldRedirect('tabs', '/welcome')).toBe(true);
    expect(shouldRedirect('onboarding', '/learn')).toBe(true);
  });

  it('redirects from the unknown index placeholder to the target branch', () => {
    expect(shouldRedirect('auth', '/')).toBe(true);
  });
});

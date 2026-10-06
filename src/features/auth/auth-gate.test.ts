import * as fs from 'node:fs';
import * as path from 'node:path';

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

  it('maps intro, age-gate, and welcome to the auth branch', () => {
    expect(pathnameToBranch('/intro')).toBe('auth');
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
    // Trading screens (market-data-paper-trading spec) are also signed-in
    // routes outside the (tabs) group and must map to the tabs branch, so the
    // gate does not bounce the user back to /(tabs)/learn when they open one.
    expect(pathnameToBranch('/stock/AAPL')).toBe('tabs');
    expect(pathnameToBranch('/trade/AAPL')).toBe('tabs');
    expect(pathnameToBranch('/history')).toBe('tabs');
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

/**
 * Bug condition (daily-briefing-tab-fix, Property 1): a signed-in user with a
 * profile (target branch `tabs`) at a pathname starting with `/briefing` must
 * stay there. If `/briefing` is not classified as the tabs branch, the gate
 * replaces it with /(tabs)/learn and the Daily Market Briefing never opens.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 */
describe('briefing route (bug condition)', () => {
  // Scoped to the concrete failing inputs: the bug is deterministic, so these
  // pathnames are the whole input space that matters for the property.
  const briefingPaths = ['/briefing', '/briefing/', '/briefing?ref=card'];

  it.each(briefingPaths)('maps %s to the tabs branch', (p) => {
    expect(pathnameToBranch(p)).toBe('tabs');
  });

  it.each(briefingPaths)('does not redirect a signed-in user away from %s', (p) => {
    expect(shouldRedirect('tabs', p)).toBe(false);
  });

  it('classifies every root-level signed-in route under app/ as the tabs branch', () => {
    const appDir = path.join(__dirname, '../../../app');

    // Entries that are not signed-in root routes: the root layout, the index
    // placeholder (intentionally unclassified so the gate redirects from it),
    // the pre-login (auth) group, Expo Router special files (+not-found,
    // +html, ...), and hidden files such as .DS_Store.
    const isRouteEntry = (name: string) =>
      !name.startsWith('.') &&
      !name.startsWith('+') &&
      !name.startsWith('_layout.') &&
      !name.startsWith('index.');
    const toSegment = (entry: fs.Dirent) =>
      entry.isDirectory() ? entry.name : entry.name.replace(/\.[jt]sx?$/, '');

    const prefixes: string[] = [];
    for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
      if (!isRouteEntry(entry.name) || entry.name === '(auth)') continue;

      if (entry.isDirectory() && /^\(.+\)$/.test(entry.name)) {
        // A route group such as (tabs) adds no URL segment, so each of its
        // children is its own root route (/learn, /explore, ...).
        for (const child of fs.readdirSync(path.join(appDir, entry.name), {
          withFileTypes: true,
        })) {
          if (isRouteEntry(child.name)) prefixes.push(`/${toSegment(child)}`);
        }
      } else {
        prefixes.push(`/${toSegment(entry)}`);
      }
    }

    // Guard against a vacuous pass if the directory layout changes.
    expect(prefixes.length).toBeGreaterThan(0);

    const unclassified = prefixes.filter((p) => pathnameToBranch(p) !== 'tabs').sort();
    expect(unclassified).toEqual([]);
  });
});

/**
 * Preservation (daily-briefing-tab-fix, Property 2): every routing decision
 * outside the bug condition (pathname starting with `/briefing` while the
 * target is `tabs`) must be unchanged by the fix. Expected values below were
 * recorded by running the UNFIXED pathnameToBranch/shouldRedirect on these
 * inputs, so they pin the baseline behavior.
 *
 * Table-driven rather than generated: fast-check is not a dependency, and the
 * route table is small enough to enumerate (prefixes x suffixes x targets).
 *
 * **Validates: Requirements 3.3, 3.4, 3.5, 3.6**
 */
describe('preservation', () => {
  const targets = ['age-block', 'auth', 'onboarding', 'tabs'] as const;

  // Existing signed-in root routes (requirement 3.3), each combined with
  // representative suffixes: bare, trailing slash, child, grandchild, query.
  const signedInPrefixes = [
    '/learn',
    '/explore',
    '/portfolio',
    '/profile',
    '/lesson',
    '/rewind',
    '/settings',
    '/stock',
    '/trade',
    '/history',
  ];
  const suffixes = ['', '/', '/x', '/x/y', '?q=1'];
  const signedInPaths = [
    ...signedInPrefixes.flatMap((prefix) => suffixes.map((suffix) => `${prefix}${suffix}`)),
    // Concrete routes observed on unfixed code.
    '/(tabs)/learn',
    '/lesson/abc',
    '/lesson/placement',
    '/settings/feedback',
    '/stock/AAPL',
    '/trade/AAPL',
  ];

  // Pre-login and blocked branches, with and without the (auth) group segment.
  const otherBranchPaths: [string, 'age-block' | 'auth' | 'onboarding'][] = [
    ['/(auth)/age-block', 'age-block'],
    ['/age-block', 'age-block'],
    ['/(auth)/onboarding', 'onboarding'],
    ['/onboarding', 'onboarding'],
    ['/(auth)/intro', 'auth'],
    ['/intro', 'auth'],
    ['/(auth)/age-gate', 'auth'],
    ['/age-gate', 'auth'],
    ['/(auth)/welcome', 'auth'],
    ['/welcome', 'auth'],
  ];

  describe('existing signed-in routes stay on the tabs branch (3.3, 3.6)', () => {
    it.each(signedInPaths)('maps %s to the tabs branch', (p) => {
      expect(pathnameToBranch(p)).toBe('tabs');
    });

    it.each(signedInPaths)('does not redirect a signed-in user away from %s', (p) => {
      expect(shouldRedirect('tabs', p)).toBe(false);
    });
  });

  describe('other branches keep their classification (3.4, 3.6)', () => {
    it.each(otherBranchPaths)('maps %s to %s', (p, branch) => {
      expect(pathnameToBranch(p)).toBe(branch);
    });

    it('does not interrupt the auth flow (age-gate -> welcome)', () => {
      expect(shouldRedirect('auth', '/welcome')).toBe(false);
    });
  });

  describe('index placeholder still triggers the initial redirect (3.5)', () => {
    it('leaves / unclassified', () => {
      expect(pathnameToBranch('/')).toBeUndefined();
    });

    it.each(targets)('redirects a %s user away from /', (t) => {
      expect(shouldRedirect(t, '/')).toBe(true);
    });
  });

  describe('non-tabs users are still redirected away from /briefing (3.4)', () => {
    it.each(['auth', 'age-block', 'onboarding'] as const)(
      'redirects a %s user away from /briefing',
      (t) => {
        expect(shouldRedirect(t, '/briefing')).toBe(true);
      },
    );
  });

  describe('shouldRedirect is consistent with pathnameToBranch', () => {
    // Every branch target crossed with the whole table, including /briefing
    // and /, so the redirect decision is always "current branch != target".
    const allPaths = [...signedInPaths, ...otherBranchPaths.map(([p]) => p), '/', '/briefing'];
    const cases = targets.flatMap((t) => allPaths.map((p) => [t, p] as const));

    it.each(cases)('target %s at %s', (t, p) => {
      expect(shouldRedirect(t, p)).toBe(pathnameToBranch(p) !== t);
    });
  });
});

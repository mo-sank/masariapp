/**
 * AuthGate: top-level routing decision (requirements 3.4, 3.5, 4.1).
 *
 * Sits at the root of the app (rendered by app/_layout.tsx beneath the provider
 * stack) and sends the user to the right place based on three pieces of state:
 *
 *   1. the device-local under-13 block flag (use-age-block),
 *   2. whether an Auth0 session exists (useSession), and
 *   3. for a signed-in user, whether they have a profile yet (useProfile).
 *
 * Routing table (from design.md "Startup and routing flow"):
 *   - under-13 flag set            -> /(auth)/age-block
 *   - no session                   -> /(auth)/age-gate (which then routes to welcome)
 *   - session, no profile          -> /(auth)/onboarding
 *   - session, has profile         -> /(tabs)/learn
 *
 * The gate holds the splash screen until every input has loaded, so the user
 * never sees a flash of the wrong screen. It redirects only when the user is on
 * the wrong branch, and it leaves navigation WITHIN a branch alone — e.g. once
 * routed into the auth flow it lets the age gate move the user on to welcome,
 * and it does not fight per-screen navigation inside the tabs.
 */
import { SplashScreen, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAgeBlock } from './use-age-block';
import { useProfile } from './use-profile';
import { useSession } from '../../lib/auth0';

// Keep the native splash visible until the gate has resolved the initial state.
// Safe to call at module load; hiding is driven by the effect below.
void SplashScreen.preventAutoHideAsync();

/** Which top-level branch a given pathname belongs to. */
type Branch = 'age-block' | 'auth' | 'onboarding' | 'tabs';

/** Where each branch's redirect target lives. */
const BRANCH_ROUTE: Record<Branch, string> = {
  'age-block': '/(auth)/age-block',
  auth: '/(auth)/age-gate',
  onboarding: '/(auth)/onboarding',
  tabs: '/(tabs)/learn',
};

/**
 * Decide the branch the user belongs in from the resolved state. Returns `null`
 * while any input is still loading (the caller keeps the splash up until then).
 */
export function decideBranch(input: {
  ageBlockLoading: boolean;
  isBlocked: boolean;
  sessionLoading: boolean;
  isSignedIn: boolean;
  profileLoading: boolean;
  hasProfile: boolean;
}): Branch | null {
  const { ageBlockLoading, isBlocked, sessionLoading, isSignedIn, profileLoading, hasProfile } =
    input;

  // Wait for the device flag and the session before deciding anything.
  if (ageBlockLoading || sessionLoading) {
    return null;
  }

  // A blocked device is a dead end regardless of session state.
  if (isBlocked) {
    return 'age-block';
  }

  // No session: start the pre-login flow at the age gate.
  if (!isSignedIn) {
    return 'auth';
  }

  // Signed in: wait for the profile lookup, then split onboarding vs tabs.
  if (profileLoading) {
    return null;
  }
  return hasProfile ? 'tabs' : 'onboarding';
}

/**
 * Map the current pathname to the branch it belongs to. The age gate, welcome,
 * and onboarding all live under the `(auth)` group but represent different
 * branches, so we match the leaf route rather than just the group.
 */
export function pathnameToBranch(pathname: string): Branch | undefined {
  if (pathname.includes('age-block')) return 'age-block';
  if (pathname.includes('onboarding')) return 'onboarding';
  if (pathname.includes('age-gate') || pathname.includes('welcome')) return 'auth';
  if (
    pathname.includes('(tabs)') ||
    pathname.startsWith('/learn') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/portfolio') ||
    pathname.startsWith('/profile')
  ) {
    return 'tabs';
  }
  return undefined;
}

/**
 * Whether the user, currently at `pathname`, needs to be redirected to the
 * target branch. We only redirect when the current location belongs to a
 * DIFFERENT branch, so navigation within the correct branch (age-gate ->
 * welcome, tab to tab) is never interrupted.
 */
export function shouldRedirect(target: Branch, pathname: string): boolean {
  const current = pathnameToBranch(pathname);
  return current !== target;
}

/**
 * The gate component. Renders nothing visible; it only drives redirects and the
 * splash screen. Place it beneath the provider stack and alongside the router
 * (e.g. next to a <Slot /> or <Stack />) in the root layout.
 */
export function AuthGate() {
  const router = useRouter();
  const pathname = usePathname();

  const { isLoading: ageBlockLoading, isBlocked } = useAgeBlock();
  const { isLoading: sessionLoading, isSignedIn } = useSession();
  const { isLoading: profileLoading, hasProfile } = useProfile(isSignedIn);

  const target = decideBranch({
    ageBlockLoading,
    isBlocked,
    sessionLoading,
    isSignedIn,
    profileLoading,
    hasProfile,
  });

  useEffect(() => {
    // Still resolving initial state: keep the splash up and do nothing.
    if (target == null) {
      return;
    }

    // State is ready: reveal the app, then redirect if we are on the wrong
    // branch. Hiding the splash is idempotent, so calling it on every settled
    // render is fine.
    void SplashScreen.hideAsync();

    if (shouldRedirect(target, pathname)) {
      router.replace(BRANCH_ROUTE[target] as Parameters<typeof router.replace>[0]);
    }
  }, [target, pathname, router]);

  return null;
}

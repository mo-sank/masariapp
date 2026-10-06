# Daily Briefing Tab Fix Bugfix Design

## Overview

Tapping the Daily Market Briefing card on the Learn tab calls `router.push('/briefing')`, but `AuthGate` immediately replaces the route with `/(tabs)/learn`, so the tap looks like it does nothing. The cause is `pathnameToBranch` in `src/features/auth/auth-gate.tsx`: its allow-list of signed-in (tabs branch) prefixes omits `/briefing`, so the pathname maps to `undefined`, `shouldRedirect('tabs', '/briefing')` returns `true`, and the gate redirects.

The fix is a one-line addition of `pathname.startsWith("/briefing")` to the tabs-branch condition, plus an updated comment. `BriefingCard` and `app/briefing.tsx` are correct and stay untouched. A route-coverage test guards against the same class of bug the next time a signed-in root route is added.

## Glossary

- **Bug_Condition (C)**: A signed-in user with a profile (target branch `tabs`) is at a pathname starting with `/briefing`.
- **Property (P)**: `pathnameToBranch` returns `"tabs"` for that pathname, so `shouldRedirect('tabs', pathname)` is `false` and no `router.replace` happens.
- **Preservation**: Every pathname outside C maps to the same branch as before, and every redirect decision outside C is unchanged.
- **pathnameToBranch**: Function in `src/features/auth/auth-gate.tsx` that maps a pathname to `'age-block' | 'auth' | 'onboarding' | 'tabs' | undefined`.
- **shouldRedirect**: Function in the same file that returns `pathnameToBranch(pathname) !== target`.
- **decideBranch**: Function in the same file that picks the target branch from age-block, session, and profile state. Not changed.
- **Branch**: The top-level area a user belongs in. `undefined` means "unknown route", which always triggers a redirect (used intentionally for the index placeholder `/`).

## Bug Details

### Bug Condition

The bug manifests whenever the gate's target branch is `tabs` and the pathname is `/briefing` (or anything under it). `pathnameToBranch` falls through every check and returns `undefined`, which never equals `'tabs'`, so the gate redirects. Unlock state is irrelevant: both the unlocked briefing and its locked state (naming lesson B1) are unreachable.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { target: Branch, pathname: string }
  OUTPUT: boolean

  RETURN input.target = 'tabs'
         AND input.pathname STARTS WITH '/briefing'
         AND pathnameToBranch(input.pathname) != 'tabs'   // true on unfixed code
END FUNCTION
```

### Examples

- Signed-in learner with B1 complete taps the briefing card. Expected: `/briefing` shows the three-card briefing. Actual: `pathnameToBranch('/briefing')` is `undefined`, gate calls `router.replace('/(tabs)/learn')`, learner stays on Learn.
- Signed-in learner without the unlock opens `/briefing` via deep link. Expected: locked state naming B1 with "Start lesson". Actual: bounced to `/(tabs)/learn`.
- `shouldRedirect('tabs', '/briefing')` returns `true` on unfixed code; expected `false`.
- Edge case: signed-out user at `/briefing` (target `auth`). Expected and actual: redirect to `/(auth)/age-gate`. This must still hold after the fix, since `'tabs' !== 'auth'`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Existing signed-in routes (`/learn`, `/explore`, `/portfolio`, `/profile`, `/lesson/*`, `/rewind`, `/settings/*`, `/stock/*`, `/trade/*`, `/history`, and any `(tabs)` path) still map to `"tabs"`.
- `age-block`, `onboarding`, `age-gate`, and `welcome` paths still map to their branches, and their checks still run before the tabs check.
- `/` still maps to `undefined`, so the initial redirect from the index placeholder still happens.
- Signed-out, age-blocked, and onboarding users at `/briefing` or any signed-in route are still redirected to their own branch.
- `decideBranch`, `BRANCH_ROUTE`, the splash-screen handling, `BriefingCard` visibility rules (hidden unless unlocked), and the briefing screen's loading/error/fail-closed/three-card states are untouched.

**Scope:**
All inputs where the pathname does not start with `/briefing` are completely unaffected. This includes:
- Every existing tabs-branch, auth-branch, age-block, and onboarding pathname
- The index `/` and any other unknown pathname
- All `decideBranch` inputs (no change to that function)

## Hypothesized Root Cause

Confirmed by reading `src/features/auth/auth-gate.tsx`:

1. **Incomplete allow-list (confirmed)**: The tabs-branch condition enumerates root routes by prefix. `app/briefing.tsx` was added as a new root-level stack screen, but its prefix was never added. The function returns `undefined`, and `shouldRedirect` treats `undefined` as "wrong branch".

2. **No coverage guard**: Tests in `src/features/auth/auth-gate.test.ts` check a hand-written list of paths, so nothing fails when a new file appears under `app/` without a matching prefix. The same bug class happened before for `stock/*`, `trade/*`, and `history` (the comment notes them as later additions).

3. **Ruled out**: `BriefingCard`'s `router.push('/briefing')` and `app/briefing.tsx` behave correctly; the push succeeds and the gate's effect undoes it on the next pathname change.

### Considered alternative: default unknown paths to tabs

Inverting the logic (any path that is not auth, age-block, onboarding, or `/` counts as `tabs`) would prevent future omissions. It is not adopted because:
- `undefined` is load-bearing. It is what forces a redirect from `/` and from mistyped or stale deep links. Defaulting to `tabs` would let a signed-in user sit on an unmatched route (Expo Router's not-found screen) without being sent home.
- It widens the change from one prefix to a semantic shift in how every route is classified, which is more than this bug needs.

The route-coverage test (below) gets most of the robustness benefit without changing runtime semantics: adding a new root route without classifying it will fail CI.

## Correctness Properties

Property 1: Bug Condition - Briefing route belongs to the signed-in branch

_For any_ pathname starting with `/briefing` (e.g. `/briefing`, `/briefing/`, `/briefing?x=1`), the fixed `pathnameToBranch` SHALL return `"tabs"`, and `shouldRedirect('tabs', pathname)` SHALL return `false`, so a signed-in user with a profile stays on the briefing screen (showing either the unlocked briefing or the locked state naming B1).

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - All other routing decisions unchanged

_For any_ pathname that does not start with `/briefing`, the fixed `pathnameToBranch` SHALL return the same value as the original, and _for any_ target branch other than `tabs` and any pathname (including `/briefing`), `shouldRedirect` SHALL return `true` exactly when the original did, preserving existing signed-in routes, auth-flow navigation, age-block and onboarding redirects, and the initial redirect from `/`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

**File**: `src/features/auth/auth-gate.tsx`

**Function**: `pathnameToBranch`

**Specific Changes**:
1. **Add the briefing prefix**: Add `pathname.startsWith("/briefing") ||` to the tabs-branch `if` condition, alongside the other root-route prefixes.
2. **Update the comment**: Add `briefing` to the list of authenticated screens reachable from the tabs, and note that every new root-level signed-in route under `app/` must be added here (and that a test enforces it).
3. **No other runtime changes**: `decideBranch`, `shouldRedirect`, `BRANCH_ROUTE`, `AuthGate`, `BriefingCard`, and `app/briefing.tsx` stay as they are.

**File**: `src/features/auth/auth-gate.test.ts`

4. **Add unit and preservation tests** as described in the Testing Strategy.
5. **Add a route-coverage test**: Read the top-level entries of `app/` (excluding `_layout.tsx`, `index.tsx`, and the `(auth)` group), derive each root route prefix (`briefing.tsx` → `/briefing`, `stock/` → `/stock`, and the `(tabs)` children → `/learn`, etc.), and assert each maps to `"tabs"`.

## Testing Strategy

### Validation Approach

Two phases: first run the new tests against the unfixed code to confirm they fail for the reason in the root cause analysis, then apply the fix and confirm they pass while every existing test still passes. Run with `npx jest src/features/auth/auth-gate.test.ts`, then `npx expo lint` and `npx tsc --noEmit`.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on unfixed code that confirm the missing prefix is the cause.

**Test Plan**: Add assertions for briefing pathnames to `auth-gate.test.ts` and run them before changing `auth-gate.tsx`.

**Test Cases**:
1. **Briefing maps to tabs**: `pathnameToBranch('/briefing')` equals `"tabs"` (will fail on unfixed code: returns `undefined`)
2. **No redirect for signed-in user**: `shouldRedirect('tabs', '/briefing')` equals `false` (will fail on unfixed code: returns `true`)
3. **Route coverage**: every root route derived from `app/` maps to `"tabs"` (will fail on unfixed code, reporting only `/briefing`)
4. **Trailing slash edge case**: `pathnameToBranch('/briefing/')` equals `"tabs"` (will fail on unfixed code)

**Expected Counterexamples**:
- `pathnameToBranch('/briefing')` returns `undefined`
- The coverage test lists `/briefing` as the only unclassified root route. If it lists others, they are additional latent instances of the same bug and should be raised before fixing.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL pathname IN ['/briefing', '/briefing/', '/briefing?ref=card'] DO
  ASSERT pathnameToBranch_fixed(pathname) = 'tabs'
  ASSERT shouldRedirect_fixed('tabs', pathname) = false
END FOR
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does not hold, the fixed function matches the original.

**Pseudocode:**
```
FOR ALL pathname WHERE NOT pathname STARTS WITH '/briefing' DO
  ASSERT pathnameToBranch_original(pathname) = pathnameToBranch_fixed(pathname)
END FOR

FOR ALL target IN ['auth', 'age-block', 'onboarding'], pathname IN allKnownPaths DO
  ASSERT shouldRedirect_original(target, pathname) = shouldRedirect_fixed(target, pathname)
END FOR
```

**Testing Approach**: Property-style checking is used for preservation because it covers the whole route table rather than a few hand-picked paths. `fast-check` is not currently installed, so the default is a table-driven check over the enumerated route set (existing prefixes × sample suffixes, plus every branch target). If the team wants generated inputs, add `fast-check` as a pinned dev dependency (`npx expo install -- --save-dev fast-check@<exact>`); this is optional.

**Test Plan**: The existing `pathnameToBranch` and `shouldRedirect` describe blocks already pass on unfixed code and capture current behavior. Keep them unchanged and add the cases below.

**Test Cases**:
1. **Existing signed-in routes**: `/learn`, `/explore`, `/portfolio`, `/profile`, `/(tabs)/learn`, `/lesson/abc`, `/lesson/placement`, `/rewind`, `/settings`, `/settings/feedback`, `/stock/AAPL`, `/trade/AAPL`, `/history` all map to `"tabs"`, and `shouldRedirect('tabs', p)` is `false`.
2. **Other branches**: `/(auth)/age-block` → `"age-block"`, `/(auth)/onboarding` → `"onboarding"`, `/(auth)/age-gate` and `/(auth)/welcome` → `"auth"`; `shouldRedirect('auth', '/welcome')` stays `false`.
3. **Index placeholder**: `pathnameToBranch('/')` stays `undefined`, and `shouldRedirect(t, '/')` is `true` for every branch `t`.
4. **Non-tabs users on briefing**: `shouldRedirect('auth', '/briefing')`, `shouldRedirect('age-block', '/briefing')`, and `shouldRedirect('onboarding', '/briefing')` are all `true`.

### Unit Tests

- `pathnameToBranch('/briefing')` and `/briefing/` return `"tabs"`
- `shouldRedirect('tabs', '/briefing')` returns `false`
- `shouldRedirect` returns `true` for `/briefing` with targets `auth`, `age-block`, `onboarding`
- `/` remains `undefined`

### Property-Based Tests

- For every signed-in root prefix (existing list plus `/briefing`) combined with a set of suffixes (`''`, `'/'`, `'/x'`, `'/x/y'`, `'?q=1'`), `pathnameToBranch` returns `"tabs"`
- For every branch target and every path in the combined table, `shouldRedirect` matches `pathnameToBranch(p) !== target`, and non-briefing results match the pre-fix expectations
- Route coverage: every root route derived from the `app/` directory listing maps to `"tabs"`, so a future screen added without a prefix fails CI

### Integration Tests

- Render `AuthGate` with mocked `useAgeBlock`/`useSession`/`useProfile` (signed in, has profile) and `usePathname` returning `/briefing`; assert `router.replace` is not called
- Same setup with the session signed out; assert `router.replace('/(auth)/age-gate')` is called
- Manual check on device: complete B1, tap the briefing card on Learn, confirm the briefing screen opens and stays; open `/briefing` before unlocking and confirm the locked state naming B1

# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Briefing route belongs to the signed-in branch
  - **CRITICAL**: These tests MUST FAIL on unfixed code. Failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: These tests encode the expected behavior and will validate the fix once they pass
  - **GOAL**: Surface counterexamples showing `/briefing` is not classified as the `tabs` branch
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to the concrete failing pathnames `['/briefing', '/briefing/', '/briefing?ref=card']` with target `tabs`
  - Add a new `describe('briefing route (bug condition)')` block in `src/features/auth/auth-gate.test.ts`, reusing the existing mocks and imports
  - Bug condition from design: `isBugCondition(input)` where `input.target = 'tabs' AND input.pathname STARTS WITH '/briefing'`
  - For each scoped pathname, assert `pathnameToBranch(p)` equals `"tabs"` and `shouldRedirect('tabs', p)` equals `false` (Expected Behavior, Property 1 in design)
  - Add a route-coverage test: read the top-level entries of `app/` with `fs.readdirSync` (resolved via `path.join(__dirname, '../../../app')`), exclude `_layout.tsx`, `index.tsx`, and the `(auth)` group, derive root prefixes (`briefing.tsx` → `/briefing`, `history.tsx` → `/history`, `rewind.tsx` → `/rewind`, `lesson/` → `/lesson`, `settings/` → `/settings`, `stock/` → `/stock`, `trade/` → `/trade`, and each non-layout child of `(tabs)/` → `/learn`, `/explore`, `/portfolio`, `/profile`), then assert every prefix maps to `"tabs"`. Collect unclassified prefixes into an array and assert it equals `[]` so the failure message lists them
  - Run `npx jest src/features/auth/auth-gate.test.ts` on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL. Expected counterexamples: `pathnameToBranch('/briefing')` returns `undefined`; `shouldRedirect('tabs', '/briefing')` returns `true`; coverage test reports `['/briefing']` as the only unclassified route
  - If the coverage test reports any route other than `/briefing`, stop and raise it with the user before fixing (latent instance of the same bug)
  - Document the counterexamples found, then mark the task complete
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - All other routing decisions unchanged
  - **IMPORTANT**: Follow observation-first methodology. Run the unfixed code on non-buggy inputs (pathname not starting with `/briefing`, or target not `tabs`) and record the outputs before writing assertions
  - Use table-driven checks with `it.each` / nested loops. No new dependencies (`fast-check` is not installed)
  - Keep the existing `decideBranch`, `pathnameToBranch`, and `shouldRedirect` describe blocks unchanged; add a new `describe('preservation')` block
  - Observe: `/learn`, `/explore`, `/portfolio`, `/profile`, `/(tabs)/learn`, `/lesson/abc`, `/lesson/placement`, `/rewind`, `/settings`, `/settings/feedback`, `/stock/AAPL`, `/trade/AAPL`, `/history` map to `"tabs"` on unfixed code
  - Existing signed-in routes: for every prefix in `['/learn', '/explore', '/portfolio', '/profile', '/lesson', '/rewind', '/settings', '/stock', '/trade', '/history']` combined with suffixes `['', '/', '/x', '/x/y', '?q=1']`, assert `pathnameToBranch(p)` is `"tabs"` and `shouldRedirect('tabs', p)` is `false`
  - Other branches: `/(auth)/age-block` and `/age-block` → `"age-block"`, `/(auth)/onboarding` and `/onboarding` → `"onboarding"`, `/(auth)/age-gate`, `/age-gate`, `/(auth)/welcome`, `/welcome` → `"auth"`; `shouldRedirect('auth', '/welcome')` stays `false`
  - Index placeholder: `pathnameToBranch('/')` is `undefined`, and `shouldRedirect(t, '/')` is `true` for every `t` in `['age-block', 'auth', 'onboarding', 'tabs']`
  - Non-tabs users on briefing: `shouldRedirect('auth', '/briefing')`, `shouldRedirect('age-block', '/briefing')`, `shouldRedirect('onboarding', '/briefing')` are all `true`
  - Consistency property: for every branch target and every path in the combined table (including `/briefing` and `/`), `shouldRedirect(target, p)` equals `pathnameToBranch(p) !== target`
  - Run `npx jest src/features/auth/auth-gate.test.ts -t preservation` on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms the baseline behavior to preserve)
  - Mark the task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix the briefing route being redirected back to the Learn tab

  - [x] 3.1 Implement the fix in `pathnameToBranch`
    - In `src/features/auth/auth-gate.tsx`, add `pathname.startsWith("/briefing") ||` to the tabs-branch `if` condition alongside the other root-route prefixes
    - Update the comment above that condition: add `briefing` to the list of authenticated screens reachable from the tabs, and note that every new root-level signed-in route under `app/` must be added here (enforced by the route-coverage test)
    - Do not change `decideBranch`, `shouldRedirect`, `BRANCH_ROUTE`, `AuthGate`, `BriefingCard`, or `app/briefing.tsx`
    - _Bug_Condition: isBugCondition(input) where input.target = 'tabs' AND input.pathname STARTS WITH '/briefing'_
    - _Expected_Behavior: pathnameToBranch(p) = 'tabs' AND shouldRedirect('tabs', p) = false for p STARTS WITH '/briefing' (Property 1 in design)_
    - _Preservation: every pathname not starting with '/briefing' maps to the same branch as before; non-tabs targets still redirect from '/briefing'; '/' stays undefined (Preservation Requirements in design)_
    - _Requirements: 2.1, 2.2, 2.3, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Briefing route belongs to the signed-in branch
    - **IMPORTANT**: Re-run the SAME tests from task 1. Do NOT write new tests
    - Run `npx jest src/features/auth/auth-gate.test.ts -t "briefing route"`
    - **EXPECTED OUTCOME**: Tests PASS, including the route-coverage test (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - All other routing decisions unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2. Do NOT write new tests
    - Run the full `npx jest src/features/auth/auth-gate.test.ts` so the original describe blocks run too
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [ ]* 3.4 Add an `AuthGate` integration test
    - Render `AuthGate` with mocked `useAgeBlock`, `useSession`, and `useProfile` (signed in, has profile) and `usePathname` returning `/briefing`; assert `router.replace` is not called
    - Same setup with the session signed out; assert `router.replace('/(auth)/age-gate')` is called
    - Follow the existing mocking patterns in `src/features/auth/*.test.tsx` and `__tests__/`
    - _Requirements: 2.2, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `npx jest` (full suite) and confirm everything passes
  - Run `npx expo lint` and `npx tsc --noEmit` and fix any issues
  - Manual device check (for the user): complete B1, tap the briefing card on Learn, confirm the briefing opens and stays; open `/briefing` before unlocking and confirm the locked state naming B1 (covers 3.1, 3.2, 3.7, which the unit tests do not exercise)
  - Ensure all tests pass, ask the user if questions arise

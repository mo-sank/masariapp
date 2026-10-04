# features/auth

Age gate, welcome, onboarding, username generation, and `create_profile` client
API. Screens in `app/(auth)/` call hooks and API functions from here.

## Implemented

- `age.ts` — `computeAge(month, year, now?)` and `isUnderMin(age)`. Pure age math
  using the last day of the birth month so borderline users are treated as
  younger (requirement 2.4). Unit tested in `age.test.ts`.
- `use-age-block.ts` — device-local under-13 block flag persisted to
  AsyncStorage under `under13_blocked`. Holds no personal data. Exposes
  `useAgeBlock()` plus `readAgeBlock`/`setAgeBlock`/`clearAgeBlock`.
- `onboarding-store.ts` — Zustand store holding `birthMonth`/`birthYear` in
  memory only (requirement 2.3), for later use by `create_profile`.

The `app/(auth)/age-gate.tsx` and `app/(auth)/age-block.tsx` screens compose
these. Welcome, onboarding, username generation, and the `create_profile` API
arrive in later tasks.

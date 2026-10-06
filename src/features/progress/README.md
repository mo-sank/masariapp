# features/progress

XP, streaks, feature unlocks, and the analytics event allowlist.

- `feature-keys.ts` — the single source of truth for every gated feature key
  (`FEATURE_KEYS`, `FeatureKey`), each mapped to the lesson that unlocks it and
  a short label. `feature-keys.test.ts` asserts this set equals the keys the
  lesson content declares in its `unlocks` arrays, so the two never drift.
- `hooks/use-unlock.ts` — `useUnlock(featureKey)`: the one hook screens call to
  check a feature. Backed by `user_unlocks` via `lessons/hooks/use-unlocks`;
  fails closed on loading/error and reports the unlocking lesson.
- `components/Gate.tsx` — `<Gate feature="...">`: renders children when the
  feature is unlocked, a `LockedState` (with a Start lesson deep link) when
  locked, and a retry on error. Use `fallback` to customise the locked state.
- `analytics-events.ts` — the canonical analytics event-name allowlist
  (`session_start`, `onboarding_completed` so far) and `isAllowedEventName`.
  Mirrored by the `log_events` RPC migration; keep both in sync.
- `use-session-analytics.ts` — app-root hook that logs `session_start`, starts
  the analytics flush timer, and flushes the queue on app background.

The server re-enforces every unlock on the gated action, so these client gates
are UX only, not the security boundary.

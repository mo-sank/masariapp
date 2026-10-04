# features/progress

XP, streaks, feature unlocks, and the analytics event allowlist.

- `analytics-events.ts` — the canonical analytics event-name allowlist
  (`session_start`, `onboarding_completed` so far) and `isAllowedEventName`.
  Mirrored by the `log_events` RPC migration; keep both in sync.
- `use-session-analytics.ts` — app-root hook that logs `session_start`, starts
  the analytics flush timer, and flushes the queue on app background.

The XP/streak/unlock pieces (`feature-keys.ts`, etc.) are added by later tasks.

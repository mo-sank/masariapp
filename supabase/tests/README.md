# supabase/tests

pgTAP tests run via `supabase test db` (pg_prove globs every `*.sql` here).

- `_helpers.sql` — shared helpers that fake the Auth0 identity. Loaded by each
  test with `\set helpers_included on` then `\ir _helpers.sql`. It sets the
  `request.jwt.claims` GUC (the plural key the local stack's `auth.jwt()` reads)
  so `public.current_user_id()` resolves to a chosen Auth0 `sub`. Role switching
  (`set role authenticated|anon`) is done at the top level of each test, since
  Postgres forbids changing roles inside functions. When pg_prove runs this file
  on its own it emits a trivial passing plan.
- `rls_isolation.test.sql` — cross-user isolation (Req 6.2).
- `rls_anon_denied.test.sql` — anon reads nothing (Req 6.4).
- `rls_direct_writes_denied.test.sql` — no direct INSERT/UPDATE/DELETE (Req 6.3).
- `rls_events_write_only.test.sql` — events are not selectable by clients (Req 6.3/6.5).
- `unlock_enforcement.test.sql` — server-side unlock enforcement across the gated
  RPCs (`place_market_order` buy/sell, `watchlist_add`, `submit_reflection`,
  `get_daily_briefing`): each fails closed (`feature_locked`) without its
  `user_unlocks` key and succeeds once granted (Progression Req 1.4), and
  `complete_lesson` grants the unlock on the first completion only — not on a
  sub-pass fail or a replay (Req 1.2). The `get_daily_briefing` assertions are
  guarded by a function-exists probe so they run once that RPC lands (spec
  task 6) and report as skipped until then.
- `evaluation_views.test.sql` — the team-only evaluation views (Progression
  Req 6.3, 7.1, 7.3): `v_lesson_funnel` reports started (in_progress +
  completed) vs completed per lesson so dropout is recoverable;
  `v_assessment_gain` returns one paired row per user with both Form A and
  Form B, exposing score_a/score_b/gain (and excluding a user with only Form A);
  and both views are revoked from `authenticated` and `anon` (a client SELECT
  raises 42501) while the owning/service role can still read them. The report
  SQL snippets that read these views live in `docs/evaluation-queries.sql`.
- `feedback.test.sql` — `submit_feedback` and the feedback table (Progression
  Req 5.1-5.3): a valid call stores category/message/screen for the current
  user (message trimmed, blank screen -> null); invalid shape is rejected with
  precise codes (`invalid_category`, `message_required`, `message_too_long`,
  with the 1000-char boundary honored); the per-user daily limit raises
  `rate_limited` at the cap and is isolated per user; and feedback is private —
  each user reads back only their own rows and anon reads/calls nothing.

RPC tests are added in later tasks.

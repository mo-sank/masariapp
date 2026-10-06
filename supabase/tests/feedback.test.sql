-- submit_feedback and the feedback table (Progression, Unlocks & Evaluation
-- Requirements 5.1, 5.2, 5.3).
-- Source of truth: docs/db-and-api-reference.md section 5.4 (the RPC) and
-- migrations 20250106000002_feedback_table.sql / 20250106000003_submit_feedback_rpc.sql.
--
-- What this file proves:
--   * requirement 5.1 — a valid call stores the category, message, and screen
--     name for the current user; the message is trimmed and screen defaults to
--     null when blank. Invalid shape is rejected with precise codes
--     (invalid_category, message_required, message_too_long), and the 1000-char
--     boundary is honored (1000 ok, 1001 rejected).
--   * requirement 5.2 — the per-user daily limit: at the configured limit the
--     next call raises `rate_limited`, and the limit is per-user (a second user
--     is unaffected by the first user hitting the cap).
--   * requirement 5.3 — privacy: a user reads back only their own feedback
--     through RLS, never another user's row, and anon reads nothing.
--
-- Mechanics mirror the other RPC tests: the RPC is SECURITY DEFINER and derives
-- the user from current_user_id(), so tests set JWT claims via _helpers.sql, act
-- as the `authenticated` client role for the calls, and seed profiles / config
-- as the privileged owner (which bypasses RLS). The daily limit is set to a
-- small value (3) via app_config so the rate-limit path is cheap to exercise.

begin;
select plan(19);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- A small daily limit so the rate-limit path is cheap to drive. ON CONFLICT
-- overwrites any seeded default.
insert into public.app_config(key, value) values ('feedback_daily_limit', '3')
  on conflict (key) do update set value = excluded.value;

-- Two users to prove the limit and the readback are both per-user.
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone) values
  ('auth0|userA', 'red-fox-11',  2008, '16-17', 'America/New_York'),
  ('auth0|userB', 'blue-owl-22', 2008, '16-17', 'America/New_York');

-- ===========================================================================
-- requirement 5.1 — a valid submission stores category, message, and screen.
-- ===========================================================================
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- submit_feedback returns a `public.feedback` row; convert it to jsonb so the
-- captured \gset value is valid JSON we can pick fields out of below.
select to_jsonb(public.submit_feedback('bug', '  the chart is blank  ', 'stock/AAPL')) as f1 \gset
select is(
  ((:'f1')::jsonb ->> 'category'), 'bug',
  'submit_feedback stores the chosen category');
select is(
  ((:'f1')::jsonb ->> 'message'), 'the chart is blank',
  'submit_feedback trims and stores the message');
select is(
  ((:'f1')::jsonb ->> 'screen'), 'stock/AAPL',
  'submit_feedback stores the current screen name');
select is(
  ((:'f1')::jsonb ->> 'user_id'), 'auth0|userA',
  'the feedback row is written for the current user, not an argument');

-- A blank screen is stored as null, not an empty string.
select to_jsonb(public.submit_feedback('idea', 'add dark mode', '   ')) as f2 \gset
select ok(
  ((:'f2')::jsonb -> 'screen') = 'null'::jsonb,
  'a blank screen is normalized to null');

-- --- shape validation ------------------------------------------------------
select throws_ok(
  $$ select public.submit_feedback('praise', 'nice app', 'profile') $$,
  'invalid_category',
  'an unknown category is rejected with invalid_category');
select throws_ok(
  $$ select public.submit_feedback('bug', '   ', 'profile') $$,
  'message_required',
  'a whitespace-only message is rejected with message_required');
select throws_ok(
  $$ select public.submit_feedback('bug', repeat('x', 1001), 'profile') $$,
  'message_too_long',
  'a message over 1000 chars is rejected with message_too_long');
-- Exactly 1000 chars is accepted (the inclusive boundary).
select lives_ok(
  $$ select public.submit_feedback('other', repeat('y', 1000), 'profile') $$,
  'a 1000-char message is accepted (the inclusive upper bound)');

-- ===========================================================================
-- requirement 5.2 — the per-user daily limit (set to 3 above). User A has
-- already stored 3 rows (bug, idea, other). The 4th must be rate-limited.
-- ===========================================================================
select is(
  (select count(*)::int from public.feedback where user_id = 'auth0|userA'),
  3, 'user A has stored exactly the limit (3) so far');
select throws_ok(
  $$ select public.submit_feedback('bug', 'one too many', 'profile') $$,
  'rate_limited',
  'the submission at the daily limit is rejected with rate_limited');

-- ===========================================================================
-- requirement 5.2 (per-user) — user B is unaffected by A hitting the cap.
-- ===========================================================================
reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;
select lives_ok(
  $$ select public.submit_feedback('confusing', 'what is a limit order', 'trade/AAPL') $$,
  'a different user can still submit after the first user is rate-limited');

-- ===========================================================================
-- requirement 5.3 — privacy. Each user reads back only their own feedback
-- through RLS; neither sees the other's; anon sees nothing.
-- ===========================================================================
-- User B currently sees only their own single row.
select is(
  (select count(*)::int from public.feedback), 1,
  'B reads back exactly their own feedback (one row)');
select is(
  (select count(*)::int from public.feedback where user_id <> 'auth0|userB'), 0,
  'B cannot read any other user''s feedback');

-- User A sees only their own three rows.
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;
select is(
  (select count(*)::int from public.feedback), 3,
  'A reads back exactly their own feedback (three rows)');
select is(
  (select count(*)::int from public.feedback where user_id <> 'auth0|userA'), 0,
  'A cannot read any other user''s feedback');

-- Anon reads nothing and cannot call the RPC. anon has no SELECT grant on
-- feedback at all (the foundation migration revoked everything from anon), so a
-- read is rejected with permission denied (42501) rather than returning 0 —
-- same shape as rls_anon_denied.test.sql.
reset role;
select tests.clear_claims();
set role anon;
select throws_ok(
  'select * from public.feedback',
  '42501', 'permission denied for table feedback',
  'an anonymous session cannot read feedback at all');
select throws_ok(
  $$ select public.submit_feedback('bug', 'anon message', 'welcome') $$,
  '42501', 'permission denied for function submit_feedback',
  'anon has no execute privilege on submit_feedback');

-- A signed-in session with no profile/claims still cannot act as nobody: the
-- RPC derives the user from the token and raises not_authenticated when absent.
reset role;
select tests.clear_claims();
set role authenticated;
select throws_ok(
  $$ select public.submit_feedback('bug', 'no identity', 'welcome') $$,
  'not_authenticated',
  'submit_feedback raises not_authenticated when there is no verified user');

select * from finish();
rollback;

-- Evaluation views (Progression, Unlocks & Evaluation requirements 6.3, 7.1, 7.3).
-- Source of truth: docs/db-and-api-reference.md section 6 and migration
-- 20250106000005_evaluation_views.sql.
--
-- What this file proves:
--   * requirement 7.1 — v_lesson_funnel reports started vs completed per lesson:
--     `started` counts both in_progress and completed rows, `completed` counts
--     only completed, so dropout (started - completed) is recoverable.
--   * requirement 6.3 — v_assessment_gain returns one paired row per user who
--     has both a Form A and a Form B result, exposing score_a, score_b, and the
--     gain (B - A); a user with only Form A does not appear (inner join).
--   * requirement 7.3 — both views are team-only: the `authenticated` client
--     role has no privilege to select them (42501), and so does `anon`. The
--     owning role (service-role equivalent in tests) can still read them.
--
-- Seed safety: the CLI runner seeds supabase/seed/catalog.generated.sql before
-- each test file, which populates lessons_catalog (L0, L1.1-L1.5, B1, L0B,
-- L2.1) and feature_unlock_rules via ON CONFLICT. This test NEVER re-inserts
-- catalog rows; it only references those existing lesson_ids and inserts
-- per-user fixture rows under dedicated, non-colliding user ids (auth0|evalA/B/C)
-- so it cannot collide with the seed or with any other test (each test file runs
-- in its own rolled-back transaction).

begin;
select plan(13);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- --- fixtures (as the privileged owner, which bypasses RLS) -----------------
-- Three users. A and B take both assessment forms; C takes only Form A (so C
-- must be excluded from the paired gain view).
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone) values
  ('auth0|evalA', 'green-fox-11', 2008, '16-17', 'America/New_York'),
  ('auth0|evalB', 'green-owl-22', 2008, '16-17', 'America/New_York'),
  ('auth0|evalC', 'green-cat-33', 2008, '16-17', 'America/New_York');

-- Lesson funnel fixture: use the seeded placement lesson L0 so the counts are
-- deterministic regardless of what other lessons the seed defines. All three
-- users start L0; A and B complete it, C stays in_progress. Expect for L0:
-- started = 3, completed = 2.
insert into public.lesson_progress(user_id, lesson_id, status, attempts, best_score, completed_at) values
  ('auth0|evalA', 'L0', 'completed',   1, 100, now()),
  ('auth0|evalB', 'L0', 'completed',   1,  90, now()),
  ('auth0|evalC', 'L0', 'in_progress', 1,  40, null);

-- Assessment fixture: Form A (pre) and Form B (post) on the placement lesson.
-- A: 40 -> 80 (gain 40). B: 50 -> 65 (gain 15). C: only Form A (no pair).
insert into public.assessment_results(user_id, lesson_id, form, score_pct, item_results) values
  ('auth0|evalA', 'L0', 'A', 40, '[]'::jsonb),
  ('auth0|evalA', 'L0', 'B', 80, '[]'::jsonb),
  ('auth0|evalB', 'L0', 'A', 50, '[]'::jsonb),
  ('auth0|evalB', 'L0', 'B', 65, '[]'::jsonb),
  ('auth0|evalC', 'L0', 'A', 70, '[]'::jsonb);

-- ===========================================================================
-- requirement 7.1 — v_lesson_funnel: started vs completed per lesson.
-- ===========================================================================
select is(
  (select started::int  from public.v_lesson_funnel where lesson_id = 'L0'),
  3, 'v_lesson_funnel counts every progress row (in_progress + completed) as started');
select is(
  (select completed::int from public.v_lesson_funnel where lesson_id = 'L0'),
  2, 'v_lesson_funnel counts only completed rows as completed');
select is(
  (select (started - completed)::int from public.v_lesson_funnel where lesson_id = 'L0'),
  1, 'dropout (started - completed) is recoverable from the funnel view');

-- ===========================================================================
-- requirement 6.3 — v_assessment_gain: one paired row per user with A and B.
-- ===========================================================================
-- Only A and B are paired; C (Form A only) is excluded by the inner join.
select is(
  (select count(*)::int from public.v_assessment_gain
     where user_id in ('auth0|evalA','auth0|evalB','auth0|evalC')),
  2, 'v_assessment_gain returns one row per user who has BOTH Form A and Form B');
select is(
  (select count(*)::int from public.v_assessment_gain where user_id = 'auth0|evalC'),
  0, 'a user with only Form A does not appear in the paired gain view');

-- Per-user score_a, score_b, and gain are correct.
select is(
  (select score_a::int from public.v_assessment_gain where user_id = 'auth0|evalA'),
  40, 'v_assessment_gain exposes the Form A (pre) score');
select is(
  (select score_b::int from public.v_assessment_gain where user_id = 'auth0|evalA'),
  80, 'v_assessment_gain exposes the Form B (post) score');
select is(
  (select gain::int from public.v_assessment_gain where user_id = 'auth0|evalA'),
  40, 'v_assessment_gain reports gain = score_b - score_a (A: 80 - 40)');
select is(
  (select gain::int from public.v_assessment_gain where user_id = 'auth0|evalB'),
  15, 'v_assessment_gain reports gain = score_b - score_a (B: 65 - 50)');

-- The owning role (service-role equivalent, bypasses RLS) can read the views.
select ok(
  (select count(*) from public.v_lesson_funnel) >= 1,
  'the owning/service role can read the evaluation views');

-- ===========================================================================
-- requirement 7.3 — team-only: authenticated and anon cannot select the views.
-- The views were revoked from both roles, so a SELECT raises permission denied.
-- ===========================================================================
reset role;
select tests.set_authenticated_claims('auth0|evalA');
set role authenticated;
select throws_ok(
  'select * from public.v_assessment_gain',
  '42501', 'permission denied for view v_assessment_gain',
  'authenticated cannot read v_assessment_gain (analytics are team-only)');
select throws_ok(
  'select * from public.v_lesson_funnel',
  '42501', 'permission denied for view v_lesson_funnel',
  'authenticated cannot read v_lesson_funnel (analytics are team-only)');

reset role;
select tests.clear_claims();
set role anon;
select throws_ok(
  'select * from public.v_lesson_funnel',
  '42501', 'permission denied for view v_lesson_funnel',
  'anon cannot read the evaluation views either');

select * from finish();
rollback;

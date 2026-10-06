-- complete_lesson RPC (lesson-engine Requirements 5.1, 5.2, 5.3, 5.6, 7.4-adjacent).
-- Covers the business rules in docs/db-and-api-reference.md section 5.3:
--   * prerequisite enforcement (prerequisite_not_completed),
--   * pass-threshold behavior (below pass -> in_progress, no XP, no unlock),
--   * XP awarded only on first completion, with a +5 first-try bonus at >= 90,
--   * replay awards no extra XP (Requirement 5.6) and no duplicate unlocks,
--   * streak math across local days (new / consecutive / reset),
--   * Streak Freeze: spent to bridge a one-day gap; granted by a boss lesson,
--   * feature unlock granting from feature_unlock_rules.
--
-- The RPC is SECURITY DEFINER and derives the user from current_user_id(). Tests
-- set the JWT claims via _helpers.sql, act as the `authenticated` client role,
-- and seed catalog/stats rows as the privileged owner (bypassing RLS). Streak
-- cases seed user_stats.last_active_date relative to the user's local "today"
-- (America/New_York) so they stay deterministic regardless of the wall clock.

begin;
select plan(28);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Catalog: a placement root (L0, no prereq), a lesson that unlocks a feature
-- (L1.1, prereq L0), and a boss lesson (B1, prereq L1.1) that grants a freeze.
-- ---------------------------------------------------------------------------
-- The CLI test runner seeds supabase/seed/catalog.generated.sql before each
-- test file, so L0/L1.1/B1 may already exist in lessons_catalog. `on conflict
-- ... do update` makes seeding the exact values this test relies on (e.g. B1's
-- pass_score 60, L1.1's xp_base 10) idempotent instead of colliding on the
-- lessons_catalog primary key.
insert into public.lessons_catalog(lesson_id, unit, sort_order, kind, xp_base, pass_score, prerequisite_lesson_id)
values
  ('L0',   0, 0, 'placement', 10, 60, null),
  ('L1.1', 1, 1, 'lesson',    10, 60, 'L0'),
  ('B1',   1, 9, 'boss',      20, 60, 'L1.1')
on conflict (lesson_id) do update set
  unit = excluded.unit, sort_order = excluded.sort_order, kind = excluded.kind,
  xp_base = excluded.xp_base, pass_score = excluded.pass_score,
  prerequisite_lesson_id = excluded.prerequisite_lesson_id;

insert into public.feature_unlock_rules(feature_key, lesson_id, description)
values ('explore', 'L1.1', 'Explore tab')
on conflict (feature_key) do update set
  lesson_id = excluded.lesson_id, description = excluded.description;

-- Compute "today" in the app timezone once so stats seeding lines up with the
-- date the RPC derives from profiles.timezone.
select (now() at time zone 'America/New_York')::date as app_today \gset

-- ===========================================================================
-- User A: prerequisite enforcement + pass threshold + XP + unlock + first try.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2010, '13-15', 'America/New_York');
insert into public.user_stats(user_id) values ('auth0|userA');

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- Prerequisite not met: L1.1 requires L0 completed first.
select throws_ok(
  $$ select public.complete_lesson('L1.1', 100, 1000, '[]'::jsonb) $$,
  'prerequisite_not_completed',
  'complete_lesson blocks a lesson whose prerequisite is not completed');

-- Invalid score is rejected.
select throws_ok(
  $$ select public.complete_lesson('L0', 150, 1000, '[]'::jsonb) $$,
  'invalid_score',
  'complete_lesson rejects a score above 100');

-- Below pass score on L0 (no prereq): recorded in_progress, no XP, passed=false.
select is(
  (select (public.complete_lesson('L0', 40, 1200, '[]'::jsonb)) ->> 'passed'),
  'false',
  'a sub-pass score returns passed=false');

reset role;
select is((select status from public.lesson_progress where user_id='auth0|userA' and lesson_id='L0'),
  'in_progress', 'sub-pass attempt leaves L0 in_progress (not completed)');
select is((select xp_total from public.user_stats where user_id='auth0|userA'),
  0, 'sub-pass attempt awards no XP');
select is((select count(*)::int from public.lesson_attempts where user_id='auth0|userA' and lesson_id='L0'),
  1, 'the sub-pass attempt is still logged in lesson_attempts');

-- First completion of L0 at exactly the pass score: XP = xp_base (no bonus),
-- streak starts at 1 (no prior active day).
set role authenticated;
select is(
  (select (public.complete_lesson('L0', 60, 1500, '[]'::jsonb)) ->> 'xp_awarded'),
  '10',
  'first completion at the pass score awards xp_base (10), no first-try bonus');

reset role;
select is((select status from public.lesson_progress where user_id='auth0|userA' and lesson_id='L0'),
  'completed', 'L0 is now completed');
select is((select xp_total from public.user_stats where user_id='auth0|userA'),
  10, 'xp_total reflects the first completion');
select is((select streak_current from public.user_stats where user_id='auth0|userA'),
  1, 'streak starts at 1 on the first active day');

-- Now L1.1 is available (L0 completed). Score 95 on first ever attempt earns the
-- +5 first-try bonus (xp_base 10 + 5 = 15) and grants the 'explore' unlock.
set role authenticated;
select is(
  (select (public.complete_lesson('L1.1', 95, 1800, '[]'::jsonb)) ->> 'xp_awarded'),
  '15',
  'first-try >=90 completion awards xp_base + 5 bonus');
select is(
  (select (public.complete_lesson('L1.1', 70, 900, '[]'::jsonb)) ->> 'xp_awarded'),
  '0',
  'replaying an already-completed lesson awards no extra XP (Req 5.6)');

reset role;
select is((select xp_total from public.user_stats where user_id='auth0|userA'),
  25, 'xp_total = 10 (L0) + 15 (L1.1 first try); replay added nothing');
select is((select count(*)::int from public.user_unlocks where user_id='auth0|userA' and feature_key='explore'),
  1, 'completing L1.1 grants exactly one explore unlock (no duplicate on replay)');

-- ===========================================================================
-- User B: streak increment on a consecutive local day.
-- Seed last_active_date = yesterday and a running streak of 4; a completion
-- today should advance it to 5.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userB', 'blue-owl-22', 2008, '16-17', 'America/New_York');
insert into public.user_stats(user_id, streak_current, streak_longest, last_active_date)
  values ('auth0|userB', 4, 4, (:'app_today')::date - 1);

reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;
select lives_ok(
  $$ select public.complete_lesson('L0', 80, 1000, '[]'::jsonb) $$,
  'userB completes L0 on a consecutive day');

reset role;
select is((select streak_current from public.user_stats where user_id='auth0|userB'),
  5, 'a completion the day after last activity increments the streak');

-- ===========================================================================
-- User C: a two-day gap WITH a freeze available is bridged (freeze spent, +1).
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userC', 'gray-elk-33', 2008, '16-17', 'America/New_York');
insert into public.user_stats(user_id, streak_current, streak_longest, last_active_date, streak_freezes)
  values ('auth0|userC', 6, 6, (:'app_today')::date - 2, 1);

reset role;
select tests.set_authenticated_claims('auth0|userC');
set role authenticated;
select lives_ok(
  $$ select public.complete_lesson('L0', 80, 1000, '[]'::jsonb) $$,
  'userC completes L0 after a one-day gap with a freeze available');

reset role;
select is((select streak_current from public.user_stats where user_id='auth0|userC'),
  7, 'a freeze bridges a two-day gap and the streak increments');
select is((select streak_freezes from public.user_stats where user_id='auth0|userC'),
  0, 'the bridging freeze is consumed');

-- ===========================================================================
-- User D: a two-day gap with NO freeze resets the streak to 1.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userD', 'pink-jay-44', 2008, '16-17', 'America/New_York');
insert into public.user_stats(user_id, streak_current, streak_longest, last_active_date, streak_freezes)
  values ('auth0|userD', 9, 9, (:'app_today')::date - 2, 0);

reset role;
select tests.set_authenticated_claims('auth0|userD');
set role authenticated;
select lives_ok(
  $$ select public.complete_lesson('L0', 80, 1000, '[]'::jsonb) $$,
  'userD completes L0 after a gap with no freeze');

reset role;
select is((select streak_current from public.user_stats where user_id='auth0|userD'),
  1, 'a gap with no freeze resets the streak to 1');
select is((select streak_longest from public.user_stats where user_id='auth0|userD'),
  9, 'the longest streak is preserved after a reset');

-- ===========================================================================
-- User E: completing a boss lesson grants a Streak Freeze (first completion).
-- E completes L0 -> L1.1 -> B1 in order; B1 is a boss, so a freeze is granted.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userE', 'teal-ram-55', 2008, '16-17', 'America/New_York');
insert into public.user_stats(user_id) values ('auth0|userE');

reset role;
select tests.set_authenticated_claims('auth0|userE');
set role authenticated;
select public.complete_lesson('L0', 100, 1000, '[]'::jsonb);
select public.complete_lesson('L1.1', 100, 1000, '[]'::jsonb);
select is(
  (select (public.complete_lesson('B1', 100, 1000, '[]'::jsonb)) ->> 'streak_freezes'),
  '1',
  'first completion of a boss lesson grants a Streak Freeze');

reset role;
select is((select streak_freezes from public.user_stats where user_id='auth0|userE'),
  1, 'the boss freeze is persisted to user_stats');

-- ===========================================================================
-- User F: beating a unit boss for the first time schedules a delayed (~7 day)
-- review of the unit's key concepts as due rewind_items (requirement 6.1).
-- F plays the unit's lessons with concept-tagged answers (the per-item concepts
-- the Rewind scheduler reads from lesson_attempts.answers), then beats B1. One
-- due-in-7-days rewind item should appear per distinct concept F practised in
-- unit 1, at box 3 (the 7-day review box), keyed to the boss lesson.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userF', 'gold-fox-66', 2008, '16-17', 'America/New_York');
insert into public.user_stats(user_id) values ('auth0|userF');

reset role;
select tests.set_authenticated_claims('auth0|userF');
set role authenticated;
-- L1.1 answers tag two concepts; B1's own answer tags a third. All are unit 1.
select public.complete_lesson('L0', 100, 1000, '[]'::jsonb);
select public.complete_lesson('L1.1', 100, 1000,
  '[{"item_id":"a1","concept":"shares","correct":true},
    {"item_id":"a2","concept":"supply-demand","correct":false}]'::jsonb);
select public.complete_lesson('B1', 100, 1000,
  '[{"item_id":"b1","concept":"market-order","correct":true}]'::jsonb);

reset role;
-- One review item per distinct unit-1 concept (shares, supply-demand, market-order).
select is(
  (select count(*)::int from public.rewind_items
     where user_id='auth0|userF' and item_id like 'review:U1:%'),
  3,
  'beating the boss schedules one review item per key concept of the unit (6.1)');
select ok(
  (select bool_and(due_at > now() + interval '6 days' and due_at < now() + interval '8 days')
     from public.rewind_items where user_id='auth0|userF' and item_id like 'review:U1:%'),
  'the scheduled reviews are due about 7 days out (6.1)');
select ok(
  (select bool_and(box = 3)
     from public.rewind_items where user_id='auth0|userF' and item_id like 'review:U1:%'),
  'the scheduled reviews sit in the 7-day review box');
select ok(
  (select bool_and(lesson_id = 'B1')
     from public.rewind_items where user_id='auth0|userF' and item_id like 'review:U1:%'),
  'the scheduled reviews are grouped under the unit boss lesson');

select * from finish();
rollback;

-- RLS for the learning tables (lesson-engine security properties, section 4).
-- Three guarantees, matching the foundation RLS tests, applied to the new
-- user-owned learning tables (lesson_progress, lesson_attempts,
-- assessment_results, user_unlocks, badges, rewind_items):
--   * cross-user isolation: user A reads only A's own rows, never B's,
--   * anon reads nothing,
--   * authenticated cannot INSERT/UPDATE/DELETE directly (writes go via RPCs).
-- The reference tables (lessons_catalog, feature_unlock_rules) are readable by
-- any authenticated user but still reject direct writes.

begin;
select plan(20);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Seed catalog (reference) and two users' owned rows as the privileged owner.
-- The CLI test runner seeds supabase/seed/catalog.generated.sql before each test
-- file, so L0/L1.1 and the 'explore' unlock rule may already exist; `on conflict
-- do nothing` makes these reference rows idempotent instead of colliding on the
-- primary keys. This test only needs the rows to exist (it reads them back for
-- the isolation checks below), so DO NOTHING is sufficient.
insert into public.lessons_catalog(lesson_id, unit, sort_order, kind)
  values ('L0', 0, 0, 'placement'), ('L1.1', 1, 1, 'lesson')
  on conflict (lesson_id) do nothing;
insert into public.feature_unlock_rules(feature_key, lesson_id) values ('explore', 'L1.1')
  on conflict (feature_key) do nothing;

insert into public.profiles(user_id, username, birth_year, age_band)
values ('auth0|userA', 'red-fox-11', 2010, '13-15'),
       ('auth0|userB', 'blue-owl-22', 2008, '16-17');

insert into public.lesson_progress(user_id, lesson_id, status) values
  ('auth0|userA', 'L0', 'completed'), ('auth0|userB', 'L0', 'completed');
insert into public.lesson_attempts(user_id, lesson_id, score) values
  ('auth0|userA', 'L0', 80), ('auth0|userB', 'L0', 90);
insert into public.assessment_results(user_id, lesson_id, form, score_pct, item_results) values
  ('auth0|userA', 'L0', 'A', 70, '[]'), ('auth0|userB', 'L0', 'A', 60, '[]');
insert into public.user_unlocks(user_id, feature_key, source_lesson_id) values
  ('auth0|userA', 'explore', 'L1.1'), ('auth0|userB', 'explore', 'L1.1');
insert into public.badges(user_id, badge_key) values
  ('auth0|userA', 'first-lesson'), ('auth0|userB', 'first-lesson');
insert into public.rewind_items(user_id, lesson_id, item_id) values
  ('auth0|userA', 'L0', 's1'), ('auth0|userB', 'L0', 's1');

-- ---------------------------------------------------------------------------
-- Isolation: acting as A, every user-owned learning table shows only A's row.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

select is((select count(*)::int from public.lesson_progress), 1,
  'A sees only its own lesson_progress row');
select is((select count(*)::int from public.lesson_attempts), 1,
  'A sees only its own lesson_attempts row');
select is((select count(*)::int from public.assessment_results), 1,
  'A sees only its own assessment_results row');
select is((select count(*)::int from public.user_unlocks), 1,
  'A sees only its own user_unlocks row');
select is((select count(*)::int from public.badges), 1,
  'A sees only its own badges row');
select is((select count(*)::int from public.rewind_items), 1,
  'A sees only its own rewind_items row');

-- Reference tables are readable by any authenticated user. The runner also seeds
-- the full catalog, so assert the specific rows this test relies on are visible
-- rather than an exact table count (which would depend on the seed set).
select is(
  (select count(*)::int from public.lessons_catalog where lesson_id in ('L0','L1.1')),
  2, 'A can read the shared lessons_catalog');
select is(
  (select count(*)::int from public.feature_unlock_rules where feature_key = 'explore'),
  1, 'A can read the shared feature_unlock_rules');

-- ---------------------------------------------------------------------------
-- Anon reads nothing: it holds no SELECT grant on the owned learning tables, so
-- a read raises permission denied (same convention as rls_anon_denied.test.sql).
-- ---------------------------------------------------------------------------
reset role;
select tests.clear_claims();
set role anon;

select throws_ok(
  'select * from public.lesson_progress',
  '42501', 'permission denied for table lesson_progress',
  'anon cannot read lesson_progress');
select throws_ok(
  'select * from public.user_unlocks',
  '42501', 'permission denied for table user_unlocks',
  'anon cannot read user_unlocks');
select throws_ok(
  'select * from public.rewind_items',
  '42501', 'permission denied for table rewind_items',
  'anon cannot read rewind_items');

-- ---------------------------------------------------------------------------
-- Direct writes denied for authenticated (only RPCs may write).
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

select throws_ok(
  $$ insert into public.lesson_progress(user_id, lesson_id, status)
     values ('auth0|userA', 'L1.1', 'completed') $$,
  '42501', 'permission denied for table lesson_progress',
  'authenticated cannot INSERT into lesson_progress');
select throws_ok(
  $$ update public.lesson_progress set xp_awarded = 999 where user_id = 'auth0|userA' $$,
  '42501', 'permission denied for table lesson_progress',
  'authenticated cannot UPDATE lesson_progress');
select throws_ok(
  $$ insert into public.lesson_attempts(user_id, lesson_id, score)
     values ('auth0|userA', 'L0', 100) $$,
  '42501', 'permission denied for table lesson_attempts',
  'authenticated cannot INSERT into lesson_attempts');
select throws_ok(
  $$ insert into public.assessment_results(user_id, lesson_id, form, score_pct, item_results)
     values ('auth0|userA', 'L0', 'A', 100, '[]') $$,
  '42501', 'permission denied for table assessment_results',
  'authenticated cannot INSERT into assessment_results');
select throws_ok(
  $$ insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'hacked') $$,
  '42501', 'permission denied for table user_unlocks',
  'authenticated cannot INSERT into user_unlocks');
select throws_ok(
  $$ insert into public.badges(user_id, badge_key) values ('auth0|userA', 'hacked') $$,
  '42501', 'permission denied for table badges',
  'authenticated cannot INSERT into badges');
select throws_ok(
  $$ update public.rewind_items set box = 4 where user_id = 'auth0|userA' $$,
  '42501', 'permission denied for table rewind_items',
  'authenticated cannot UPDATE rewind_items');

-- Reference tables: readable, but writes still denied.
select throws_ok(
  $$ insert into public.lessons_catalog(lesson_id, unit, sort_order, kind)
     values ('ZZ', 9, 9, 'lesson') $$,
  '42501', 'permission denied for table lessons_catalog',
  'authenticated cannot INSERT into lessons_catalog');
select throws_ok(
  $$ insert into public.feature_unlock_rules(feature_key, lesson_id) values ('hack', 'L0') $$,
  '42501', 'permission denied for table feature_unlock_rules',
  'authenticated cannot INSERT into feature_unlock_rules');

select * from finish();
rollback;

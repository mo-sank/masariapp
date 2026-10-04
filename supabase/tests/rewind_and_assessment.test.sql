-- save_rewind_items / review_rewind_item / submit_assessment RPCs
-- (lesson-engine Requirements 7.1, 7.4, 6.3).
-- Covers docs/db-and-api-reference.md section 5.4 and the Rewind scheduling in
-- the design document:
--   * save_rewind_items upserts missed items at box 0 due now (idempotent),
--   * review_rewind_item advances the box and pushes due_at out (1,3,7,14 days)
--     on a correct answer and resets to box 0 / due now on an incorrect one,
--     capping the box at 4,
--   * submit_assessment inserts an assessment_results row with a server-computed
--     score (percentage of items marked correct), with no pass/fail semantics.
--
-- SECURITY DEFINER functions derive the user from current_user_id(); tests set
-- JWT claims via _helpers.sql and act as `authenticated`.

begin;
select plan(20);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Catalog + profile the items/assessments reference.
insert into public.lessons_catalog(lesson_id, unit, sort_order, kind, xp_base, pass_score, prerequisite_lesson_id)
values ('L0', 0, 0, 'placement', 10, 60, null),
       ('L1.1', 1, 1, 'lesson', 10, 60, 'L0');

insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2010, '13-15', 'America/New_York');

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- ---------------------------------------------------------------------------
-- save_rewind_items: two missed items are queued at box 0, due now (<= now()).
-- ---------------------------------------------------------------------------
select is(
  (select public.save_rewind_items(
     '[{"lesson_id":"L1.1","item_id":"s1"},{"lesson_id":"L1.1","item_id":"s4"}]'::jsonb)),
  2,
  'save_rewind_items processes and returns the count of items');

reset role;
select is((select count(*)::int from public.rewind_items where user_id='auth0|userA'),
  2, 'two rewind items are queued');
select is((select box from public.rewind_items where user_id='auth0|userA' and item_id='s1'),
  0, 'a newly saved item starts at box 0');
select ok(
  (select due_at <= now() from public.rewind_items where user_id='auth0|userA' and item_id='s1'),
  'a newly saved item is due now');

-- Idempotent re-save of s1 does not create a duplicate and keeps it at box 0.
set role authenticated;
select is(
  (select public.save_rewind_items('[{"lesson_id":"L1.1","item_id":"s1"}]'::jsonb)),
  1, 're-saving an existing item is accepted');
reset role;
select is((select count(*)::int from public.rewind_items where user_id='auth0|userA'),
  2, 're-saving an item does not create a duplicate row');

-- Unknown lesson is rejected (FK-safe guard before the insert).
set role authenticated;
select throws_ok(
  $$ select public.save_rewind_items('[{"lesson_id":"NOPE","item_id":"x"}]'::jsonb) $$,
  'unknown_lesson',
  'save_rewind_items rejects an item referencing an unknown lesson');

-- ---------------------------------------------------------------------------
-- review_rewind_item: correct answers walk the box up (1 -> 2 -> ...) and push
-- due_at out by the interval for the NEW box (1, 3, 7 days...).
-- ---------------------------------------------------------------------------
-- First correct: box 0 -> 1, due ~1 day out.
select is(
  (select (public.review_rewind_item('s1', true)).box),
  1, 'a correct review advances box 0 -> 1');
reset role;
select ok(
  (select due_at > now() + interval '20 hours' and due_at < now() + interval '28 hours'
     from public.rewind_items where user_id='auth0|userA' and item_id='s1'),
  'box 1 pushes due_at out about 1 day');

-- Second correct: box 1 -> 2, due ~3 days out.
set role authenticated;
select is(
  (select (public.review_rewind_item('s1', true)).box),
  2, 'a second correct review advances box 1 -> 2');
reset role;
select ok(
  (select due_at > now() + interval '2 days 20 hours' and due_at < now() + interval '3 days 4 hours'
     from public.rewind_items where user_id='auth0|userA' and item_id='s1'),
  'box 2 pushes due_at out about 3 days');

-- An incorrect review resets the box to 0 and makes it due now again.
set role authenticated;
select is(
  (select (public.review_rewind_item('s1', false)).box),
  0, 'an incorrect review resets the box to 0');
reset role;
select ok(
  (select due_at <= now() from public.rewind_items where user_id='auth0|userA' and item_id='s1'),
  'an incorrect review makes the item due now');

-- The box caps at 4: four consecutive correct reviews on s4 land at box 4 and
-- a fifth stays at 4.
set role authenticated;
select public.review_rewind_item('s4', true);  -- 1
select public.review_rewind_item('s4', true);  -- 2
select public.review_rewind_item('s4', true);  -- 3
select is((select (public.review_rewind_item('s4', true)).box), 4, 's4 reaches box 4 after four correct reviews');
select is((select (public.review_rewind_item('s4', true)).box), 4, 'the box caps at 4 on further correct reviews');

-- Reviewing an item the caller does not own raises not_found.
select throws_ok(
  $$ select public.review_rewind_item('does-not-exist', true) $$,
  'rewind_item_not_found',
  'review_rewind_item rejects an unknown item for the caller');

-- ---------------------------------------------------------------------------
-- submit_assessment: score is computed server-side from the item results.
-- 3 of 4 correct -> 75.00; stored with form 'A' and no pass/fail semantics.
-- ---------------------------------------------------------------------------
set role authenticated;
select is(
  (select (public.submit_assessment('L0', 'A',
     '[{"item_id":"q1","concept":"money","correct":true},
       {"item_id":"q2","concept":"stocks","correct":true},
       {"item_id":"q3","concept":"risk","correct":false},
       {"item_id":"q4","concept":"money","correct":true}]'::jsonb)).score_pct),
  75.00,
  'submit_assessment computes the score as the percentage correct (3/4 = 75)');

reset role;
select is((select count(*)::int from public.assessment_results where user_id='auth0|userA' and lesson_id='L0'),
  1, 'submit_assessment inserts exactly one assessment_results row');
select is((select form from public.assessment_results where user_id='auth0|userA' and lesson_id='L0'),
  'A', 'the assessment row stores the submitted form');

-- An invalid form is rejected.
set role authenticated;
select throws_ok(
  $$ select public.submit_assessment('L0', 'C', '[]'::jsonb) $$,
  'invalid_form',
  'submit_assessment rejects a form other than A or B');

select * from finish();
rollback;

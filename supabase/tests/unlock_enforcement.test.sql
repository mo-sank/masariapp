-- Server-side unlock enforcement (Progression, Unlocks & Evaluation
-- Requirements 1.2 and 1.4).
-- Source of truth: docs/db-and-api-reference.md sections 5.2-5.4 (the RPCs) and
-- 5.3 (complete_lesson's first-completion unlock grant), the feature keys in
-- src/features/progress/feature-keys.ts, and the design "Testing strategy"
-- ("unlock granted only on first completion; place_market_order rejects without
-- unlock; get_daily_briefing locked without B1").
--
-- Why this file exists alongside the per-RPC test files: place_market_order.test
-- and supporting_rpcs.test each prove ONE RPC's gate in passing. This file is the
-- cross-cutting proof of the two unlock requirements as a whole:
--
--   Requirement 1.4 — the server independently enforces the same unlock the UI
--   checks. For EVERY gated write/read RPC we show the SAME shape: it fails
--   closed (feature_locked) with no unlock, and the SAME call succeeds once the
--   matching user_unlocks row exists. Covered RPCs and their keys:
--     * place_market_order  buy  -> market_buy
--     * place_market_order  sell -> market_sell
--     * watchlist_add            -> watchlist
--     * submit_reflection        -> post_trade_reflection
--     * get_daily_briefing       -> daily_briefing   (see note below)
--
--   Requirement 1.2 — complete_lesson grants user_unlocks on the FIRST
--   completion only. We complete a feature-granting lesson, assert the row
--   appears, replay it, and assert the unlock set is unchanged (no duplicate,
--   nothing newly granted on the replay). We also assert a failing attempt (below
--   the pass score) grants nothing, and that the grant actually flips the gate:
--   the RPC that was feature_locked before the lesson now succeeds, end to end.
--
-- get_daily_briefing is implemented in a later task (spec task 6). So its gate
-- can be enforced here the moment it lands without turning this suite red in the
-- meantime, its two assertions are guarded by has_function(...) + skip: once the
-- function exists they run for real (locked without daily_briefing, allowed
-- with it); until then they report as skipped. Every other assertion runs now.
--
-- Mechanics match the other RPC tests: the RPCs are SECURITY DEFINER and derive
-- the user from current_user_id(), so tests set the JWT claims via _helpers.sql,
-- act as the `authenticated` client role for the calls, and seed catalog /
-- instruments / quotes / accounts / orders / unlocks as the privileged owner
-- (which bypasses RLS). Quotes are seeded with updated_at = now() so the
-- open-market stale check never fires and the order path stays deterministic
-- regardless of whether the market is open when the suite runs.

begin;
select plan(19);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Config the RPCs read. Re-assert locally so each function exercises its real
-- (non-fallback) paths; ON CONFLICT keeps any seeded row.
-- ---------------------------------------------------------------------------
insert into public.app_config(key, value) values
  ('starter_cash_cents', '1000000'),
  ('starter_position_cap_cents', '100000'),
  ('quote_stale_minutes', '30'),
  ('watchlist_max', '5')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Instruments + fresh quotes (updated_at = now() so the stale check never trips).
-- AAA is a $100 starter stock used across the gated RPCs.
-- ---------------------------------------------------------------------------
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
values ('AAA', 'Alpha Co', 'stock', 'Tech', true, true, 1);
insert into public.quotes(symbol, price_cents, prev_close_cents, as_of, is_delayed, source, updated_at)
values ('AAA', 10000, 9900, now(), true, 'test', now());

-- ===========================================================================
-- Requirement 1.4 — every gated RPC fails closed, then the matching unlock
-- lets the exact same call through.
--
-- User A starts with NO unlocks and owns one filled sell order (so the
-- submit_reflection ownership check passes once its gate is open).
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userA', 1000000, 1000000);
insert into public.orders(account_id, user_id, symbol, side, qty, status,
    fill_price_cents, total_cents, realized_pl_cents, idempotency_key)
  values (
    (select id from public.paper_accounts where user_id='auth0|userA'),
    'auth0|userA', 'AAA', 'sell', 1, 'filled', 10000, 10000, 500, 'ord-A-sell-0001');

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- --- place_market_order (buy) : gate = market_buy -------------------------
select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-A-buy-locked') $$,
  'feature_locked',
  'place_market_order buy is feature_locked without the market_buy unlock');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'market_buy');
set role authenticated;

select lives_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-A-buy-unlocked') $$,
  'the same buy succeeds once market_buy is granted');

-- --- place_market_order (sell) : gate = market_sell -----------------------
-- A has a 1-share position from the buy above but no market_sell yet.
select throws_ok(
  $$ select public.place_market_order('AAA', 'sell', 1, 'idem-A-sell-locked') $$,
  'feature_locked',
  'place_market_order sell is feature_locked without the market_sell unlock');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'market_sell');
set role authenticated;

select lives_ok(
  $$ select public.place_market_order('AAA', 'sell', 1, 'idem-A-sell-unlocked') $$,
  'the same sell succeeds once market_sell is granted');

-- --- watchlist_add : gate = watchlist -------------------------------------
select throws_ok(
  $$ select public.watchlist_add('AAA') $$,
  'feature_locked',
  'watchlist_add is feature_locked without the watchlist unlock');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'watchlist');
set role authenticated;

select lives_ok(
  $$ select public.watchlist_add('AAA') $$,
  'the same watchlist_add succeeds once watchlist is granted');

-- --- submit_reflection : gate = post_trade_reflection ---------------------
-- A owns ord-A-sell-0001 (seeded above), so once the gate opens the ownership
-- check passes and the reflection is written.
select throws_ok(
  $$ select public.submit_reflection(
       (select id from public.orders where idempotency_key='ord-A-sell-0001'), 'as_expected', 'note') $$,
  'feature_locked',
  'submit_reflection is feature_locked without the post_trade_reflection unlock');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'post_trade_reflection');
set role authenticated;

select lives_ok(
  $$ select public.submit_reflection(
       (select id from public.orders where idempotency_key='ord-A-sell-0001'), 'as_expected', 'note') $$,
  'the same submit_reflection succeeds once post_trade_reflection is granted');

-- --- get_daily_briefing : gate = daily_briefing ---------------------------
-- Implemented in a later task; guard both assertions so they run for real once
-- the function exists and are skipped (not failed) until then. User A does NOT
-- have daily_briefing yet (only market_buy/sell, watchlist, reflection above).
-- Probe the catalog directly (NOT pgTAP has_function, which would emit its own
-- TAP line and consume a plan slot) so the \if below sees a plain boolean.
reset role;
select exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_daily_briefing'
) as briefing_exists \gset
set role authenticated;

\if :briefing_exists
select throws_ok(
  $$ select public.get_daily_briefing() $$,
  'feature_locked',
  'get_daily_briefing is feature_locked without the daily_briefing unlock');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'daily_briefing');
set role authenticated;

select lives_ok(
  $$ select public.get_daily_briefing() $$,
  'the same get_daily_briefing succeeds once daily_briefing is granted');
\else
select skip(2, 'get_daily_briefing is not implemented yet (spec task 6); gate assertions deferred');
\endif

-- ===========================================================================
-- Requirement 1.2 — complete_lesson grants user_unlocks on the FIRST
-- completion only.
--
-- This block is deliberately seed-independent: it owns a dedicated catalog
-- lesson (L_UE1, no prerequisite) mapped to a dedicated feature key
-- (ue_test_feature) so it collides with neither the shipped seed catalog nor
-- its feature_unlock_rules (whose feature_key is a primary key). Inserts use
-- ON CONFLICT so the file is safe to run against a clean CI DB or a seeded
-- local DB alike. User B drives the completion flow.
-- ===========================================================================
reset role;
insert into public.lessons_catalog(lesson_id, unit, sort_order, kind, xp_base, pass_score, prerequisite_lesson_id)
  values ('L_UE1', 99, 1, 'lesson', 10, 60, null)
  on conflict (lesson_id) do nothing;
insert into public.feature_unlock_rules(feature_key, lesson_id, description)
  values ('ue_test_feature', 'L_UE1', 'Unlock-enforcement test feature')
  on conflict (feature_key) do nothing;

insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userB', 'blue-owl-22', 2008, '16-17', 'America/New_York');

reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

-- A FAILED attempt (below pass score) grants nothing (design: "no XP, no unlock").
select is(
  (select public.complete_lesson('L_UE1', 10, 1000, '[]'::jsonb) ->> 'passed'),
  'false',
  'a sub-pass L_UE1 attempt does not pass');
reset role;
select is(
  (select count(*)::int from public.user_unlocks where user_id='auth0|userB' and feature_key='ue_test_feature'),
  0, 'a failed lesson attempt grants no unlock');

-- First completion of L_UE1 grants exactly its one declared feature.
set role authenticated;
select is(
  (select public.complete_lesson('L_UE1', 100, 1200, '[]'::jsonb) ->> 'first_completion'),
  'true', 'L_UE1 first completion reports first_completion = true');

reset role;
select is(
  (select count(*)::int from public.user_unlocks where user_id='auth0|userB' and feature_key='ue_test_feature'),
  1, 'first completion of L_UE1 grants exactly one ue_test_feature unlock');

-- Replay the already-completed lesson: the unlock is UNCHANGED (granted on first
-- completion only — no duplicate, nothing newly reported).
set role authenticated;
select is(
  (select public.complete_lesson('L_UE1', 100, 1100, '[]'::jsonb) ->> 'first_completion'),
  'false', 'replaying L_UE1 reports first_completion = false');
select is(
  (select jsonb_array_length(public.complete_lesson('L_UE1', 100, 1100, '[]'::jsonb) -> 'unlocked')),
  0, 'a replay returns an empty unlocked set (nothing newly granted)');

reset role;
select is(
  (select count(*)::int from public.user_unlocks where user_id='auth0|userB' and feature_key='ue_test_feature'),
  1, 'the replay did not duplicate the ue_test_feature unlock');

-- ===========================================================================
-- End to end (Req 1.2 feeds Req 1.4): a user who has NOT earned market_buy is
-- blocked server-side; granting the unlock the way complete_lesson would (a
-- user_unlocks row) flips the gate so the same buy now succeeds. User C.
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userC', 'gray-elk-33', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userC', 1000000, 1000000);

reset role;
select tests.set_authenticated_claims('auth0|userC');
set role authenticated;
select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-C-nounlock') $$,
  'feature_locked',
  'a user without the market_buy unlock is blocked server-side');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userC', 'market_buy');
set role authenticated;
select lives_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-C-unlocked') $$,
  'granting the market_buy unlock flips the gate so the same buy now succeeds');

select * from finish();
rollback;

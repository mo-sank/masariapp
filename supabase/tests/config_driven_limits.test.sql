-- Progression, Unlocks & Evaluation (task 10): config-driven limits.
-- Source of truth: requirement 8.1 — "WHEN app_config values (starter cash,
-- position cap, watchlist max, quote stale minutes) change THEN the server SHALL
-- use the new values on the next request".
--
-- The caps and limits the server enforces all live in public.app_config and are
-- read inside the RPCs (watchlist_add reads watchlist_max; create_profile reads
-- starter_cash_cents; place_market_order reads starter_position_cap_cents and
-- quote_stale_minutes). The individual RPC tests already prove each one is read;
-- this file proves the *tunability* contract directly: changing an app_config
-- value changes the enforced behaviour on the very next request, with no code
-- change. It flips a value mid-transaction and shows the before/after outcomes
-- differ.
--
-- Two independent dimensions are exercised so the "config drives behaviour"
-- claim is not a single-value fluke:
--   1. watchlist_max — the number of symbols a user may follow (watchlist_add
--      raises watchlist_full past the cap). Set the cap to 1, prove a second add
--      is rejected; raise the cap to 3, prove the same add now succeeds.
--   2. starter_cash_cents — the paper cash create_profile seeds. Create one user
--      at 500000, another after bumping it to 2500000, and prove each account's
--      cash equals the value configured at the moment of the request.
--
-- Seed-safety: catalog inserts here use ids/symbols that do not collide with the
-- generated catalog seed, and the config writes use ON CONFLICT ... DO UPDATE so
-- they overwrite the seeded defaults rather than fail. Everything runs inside the
-- single pgTAP transaction and is rolled back at the end.

begin;
select plan(7);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Instruments: three starters to follow. Dedicated non-colliding symbols so the
-- test is independent of whatever the catalog seed contains.
-- ---------------------------------------------------------------------------
reset role;
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
values
  ('CFG1', 'Config One',   'stock', 'Tech', true, true, 901),
  ('CFG2', 'Config Two',   'stock', 'Tech', true, true, 902),
  ('CFG3', 'Config Three', 'stock', 'Tech', true, true, 903)
on conflict (symbol) do nothing;

-- ===========================================================================
-- Dimension 1: watchlist_max is read on each request (watchlist_add).
-- ===========================================================================

-- A user who has unlocked the watchlist.
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|cfgWatch', 'cfg-fox-11', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|cfgWatch', 1000000, 1000000);
insert into public.user_unlocks(user_id, feature_key) values ('auth0|cfgWatch', 'watchlist');

-- --- Request batch 1: cap = 1 -------------------------------------------------
insert into public.app_config(key, value) values ('watchlist_max', '1')
  on conflict (key) do update set value = excluded.value;

reset role;
select tests.set_authenticated_claims('auth0|cfgWatch');
set role authenticated;

select lives_ok(
  $$ select public.watchlist_add('CFG1') $$,
  'with watchlist_max = 1, the first add succeeds');
select throws_ok(
  $$ select public.watchlist_add('CFG2') $$,
  'watchlist_full',
  'with watchlist_max = 1, a second add is rejected (cap enforced from config)');

-- --- Flip the config, same user, next request: cap = 3 ------------------------
reset role;
insert into public.app_config(key, value) values ('watchlist_max', '3')
  on conflict (key) do update set value = excluded.value;

set role authenticated;
select lives_ok(
  $$ select public.watchlist_add('CFG2') $$,
  'after raising watchlist_max to 3, the previously-rejected add now succeeds');
select lives_ok(
  $$ select public.watchlist_add('CFG3') $$,
  'a third add also succeeds under the raised cap');

reset role;
select is(
  (select count(*)::int from public.watchlist_items where user_id = 'auth0|cfgWatch'),
  3,
  'the watchlist holds three symbols — the raised cap took effect on the next request');

-- ===========================================================================
-- Dimension 2: starter_cash_cents is read on each request (create_profile).
-- Two different users created at two different configured values; each account's
-- seeded cash matches the value configured at the moment create_profile ran.
-- ===========================================================================

-- --- User A at starter_cash_cents = 500000 -----------------------------------
reset role;
insert into public.app_config(key, value) values ('starter_cash_cents', '500000')
  on conflict (key) do update set value = excluded.value;

select tests.set_authenticated_claims('auth0|cfgCashA');
set role authenticated;
select public.create_profile('cfg-cat-11', 2008, 6, 'America/New_York', 'v1', 'v1');

-- --- User B after bumping starter_cash_cents to 2500000 ----------------------
reset role;
insert into public.app_config(key, value) values ('starter_cash_cents', '2500000')
  on conflict (key) do update set value = excluded.value;

select tests.set_authenticated_claims('auth0|cfgCashB');
set role authenticated;
select public.create_profile('cfg-dog-22', 2008, 6, 'America/New_York', 'v1', 'v1');

reset role;
select is(
  (select cash_cents from public.paper_accounts where user_id = 'auth0|cfgCashA'),
  500000::bigint,
  'the first profile was seeded with the 500000 starter cash configured at the time');
select is(
  (select cash_cents from public.paper_accounts where user_id = 'auth0|cfgCashB'),
  2500000::bigint,
  'the second profile picked up the changed 2500000 starter cash on its request');

select * from finish();
rollback;

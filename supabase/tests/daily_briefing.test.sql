-- get_daily_briefing (Progression, Unlocks & Evaluation Requirements 4.1-4.4).
-- Source of truth: the design "Server" note and migration
-- 20250106000001_daily_briefing_rpc.sql.
--
-- The cross-cutting unlock_enforcement.test proves the GATE (feature_locked
-- without daily_briefing, allowed with it). This file proves the PAYLOAD the
-- unlocked RPC returns is built correctly from STORED quotes (no AI text, no
-- recommendations — requirement 4.4):
--   * card 1 (requirement 4.2): top_gainer / top_loser are the starter stocks
--     with the highest / lowest percent change from prev_close, with change_bps
--     computed in integer cents. Non-starter / inactive symbols and symbols
--     without a usable prev_close are excluded.
--   * card 2 (requirement 4.2): portfolio_day_change_cents = sum over the
--     caller's positions of qty * (price - prev_close); 0 for a user with no
--     positions. The value is per-user (RLS-equivalent: derived from
--     current_user_id, not an argument).
--   * card 3 (requirement 4.2/4.3): tip_index = day-of-year (ET) mod the tip
--     count from app_config.briefing_tip_count, in range [0, count).
--   * market_state (requirement 4.3): equals public.market_session() so the
--     client can say "as of last close" when the market is not open.
--
-- Mechanics mirror the other RPC tests: the RPC is SECURITY DEFINER and derives
-- the user from current_user_id(), so tests set JWT claims via _helpers.sql, act
-- as the `authenticated` client role for the calls, and seed catalog /
-- instruments / quotes / accounts / positions / unlocks as the privileged owner
-- (which bypasses RLS). Quotes are stored with explicit prev_close values so the
-- gainer/loser ordering and the portfolio math are deterministic regardless of
-- whether the market is open when the suite runs.

begin;
select plan(14);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Config the RPC reads. briefing_tip_count = 5 here so the modulus is exercised
-- against a known value; ON CONFLICT overwrites any seeded default.
-- ---------------------------------------------------------------------------
insert into public.app_config(key, value) values ('briefing_tip_count', '5')
  on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Instruments + quotes.
--   GAIN : +10% day (prev 10000 -> 11000)  => +1000 bps   (the top gainer)
--   FLAT : 0%  day (prev  5000 ->  5000)   =>     0 bps
--   DROP : -8% day (prev  2500 ->  2300)   =>  -800 bps    (the top loser)
--   NOPC : starter but prev_close NULL      => excluded (no measurable change)
--   NONS : non-starter, big move            => excluded (not a starter stock)
-- ---------------------------------------------------------------------------
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
values
  ('GAIN', 'Gainer Co',  'stock', 'Tech',    true,  true, 1),
  ('FLAT', 'Flat Co',    'stock', 'Tech',    true,  true, 2),
  ('DROP', 'Dropper Co', 'stock', 'Finance', true,  true, 3),
  ('NOPC', 'NoPrev Co',  'stock', 'Energy',  true,  true, 4),
  ('NONS', 'NonStart Co','stock', 'Tech',    false, true, 5);

insert into public.quotes(symbol, price_cents, prev_close_cents, as_of, is_delayed, source, updated_at)
values
  ('GAIN', 11000, 10000, now(), true, 'test', now()),
  ('FLAT',  5000,  5000, now(), true, 'test', now()),
  ('DROP',  2300,  2500, now(), true, 'test', now()),
  ('NOPC',  9999,  null, now(), true, 'test', now()),
  ('NONS', 90000, 10000, now(), true, 'test', now());  -- +800% but not a starter

-- ===========================================================================
-- User A: has the daily_briefing unlock and a portfolio.
--   holds 3 GAIN  -> day change 3 * (11000-10000) = +3000
--   holds 2 DROP  -> day change 2 * ( 2300- 2500) =  -400
--   holds 1 NOPC  -> excluded (quote has no prev_close)
--   expected portfolio_day_change_cents = +2600
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userA', 1000000, 1000000);
insert into public.positions(account_id, symbol, qty, cost_basis_cents) values
  ((select id from public.paper_accounts where user_id='auth0|userA'), 'GAIN', 3, 30000),
  ((select id from public.paper_accounts where user_id='auth0|userA'), 'DROP', 2,  5000),
  ((select id from public.paper_accounts where user_id='auth0|userA'), 'NOPC', 1,  9999);
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'daily_briefing');

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- Capture one payload and assert against it piece by piece.
select public.get_daily_briefing() as b \gset

-- --- Card 1: top gainer / top loser ---------------------------------------
select is(
  ((:'b')::jsonb -> 'top_gainer' ->> 'symbol'),
  'GAIN', 'top_gainer is the starter stock with the highest percent change');
select is(
  (((:'b')::jsonb -> 'top_gainer' ->> 'change_bps')::int),
  1000, 'top_gainer change_bps is +1000 (a +10% day in basis points)');
select is(
  ((:'b')::jsonb -> 'top_loser' ->> 'symbol'),
  'DROP', 'top_loser is the starter stock with the lowest percent change');
select is(
  (((:'b')::jsonb -> 'top_loser' ->> 'change_bps')::int),
  -800, 'top_loser change_bps is -800 (an -8% day in basis points)');
select is(
  ((:'b')::jsonb -> 'top_gainer' ->> 'name'),
  'Gainer Co', 'the mover payload carries the instrument name for display');

-- The non-starter NONS (+800%) must NOT be the gainer even though it moved most.
select isnt(
  ((:'b')::jsonb -> 'top_gainer' ->> 'symbol'),
  'NONS', 'a non-starter stock is excluded from the movers');
-- NOPC (no prev_close) must appear as neither gainer nor loser.
select ok(
  ((:'b')::jsonb -> 'top_gainer' ->> 'symbol') <> 'NOPC'
    and ((:'b')::jsonb -> 'top_loser' ->> 'symbol') <> 'NOPC',
  'a starter stock without a prev_close is excluded from the movers');

-- --- Card 2: portfolio day change -----------------------------------------
select is(
  (((:'b')::jsonb ->> 'portfolio_day_change_cents')::bigint),
  2600::bigint,
  'portfolio_day_change_cents = sum(qty * (price - prev_close)) over held, priced positions');

-- --- Card 3 + market_state ------------------------------------------------
select is(
  (((:'b')::jsonb ->> 'tip_index')::int),
  (extract(doy from (now() at time zone 'America/New_York'))::int % 5),
  'tip_index = day-of-year (ET) mod the configured tip count');
select ok(
  ((:'b')::jsonb ->> 'tip_index')::int >= 0 and ((:'b')::jsonb ->> 'tip_index')::int < 5,
  'tip_index is within [0, tip_count)');
select is(
  ((:'b')::jsonb ->> 'market_state'),
  public.market_session(),
  'market_state equals market_session() so the client can label last-close data');

-- ===========================================================================
-- User B: has the unlock but NO account/positions -> a flat (0) day change,
-- never an error. Movers are shared, so card 1 is still populated.
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userB', 'blue-owl-22', 2008, '16-17', 'America/New_York');
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userB', 'daily_briefing');

reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

select public.get_daily_briefing() as bb \gset
select is(
  (((:'bb')::jsonb ->> 'portfolio_day_change_cents')::bigint),
  0::bigint,
  'a user with no positions gets a 0 portfolio day change (no error)');
select is(
  ((:'bb')::jsonb -> 'top_gainer' ->> 'symbol'),
  'GAIN', 'the shared movers are present even for a user with no portfolio');

-- ===========================================================================
-- Gate (requirement 4.4 / Progression 1.4): a user WITHOUT the unlock is blocked
-- server-side. (The cross-cutting unlock_enforcement suite also covers this; we
-- re-assert here so this file stands alone as the briefing's proof.)
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userC', 'gray-elk-33', 2008, '16-17', 'America/New_York');
reset role;
select tests.set_authenticated_claims('auth0|userC');
set role authenticated;
select throws_ok(
  $$ select public.get_daily_briefing() $$,
  'feature_locked',
  'get_daily_briefing is feature_locked without the daily_briefing unlock');

select * from finish();
rollback;

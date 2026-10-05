-- place_market_order RPC (Market Data & Paper Trading Requirements 8.1-8.6, 8.8).
-- Source of truth: docs/db-and-api-reference.md section 5.2 and the function in
-- migration 20250105000006_place_market_order_rpc.sql.
--
-- Covers the business rules of the server-authoritative order path:
--   * feature gate: a buy without market_buy / a sell without
--     market_sell raises feature_locked (Req 8.2, 8.3),
--   * insufficient_cash on a buy the account cannot afford (Req 8.2),
--   * position_cap_exceeded when a buy would push the position past the starter
--     cap, and that raise_cap lifts the limit (Req 8.2),
--   * idempotency: a repeat with the same key returns the ORIGINAL order and
--     does not move cash or shares a second time (Req 8.5),
--   * partial and full sells adjust shares and cost basis correctly (Req 8.3),
--   * realized P&L uses PROPORTIONAL cost basis, rounded to the nearest cent,
--     and a full sell realizes proceeds minus the whole basis (Req 8.3),
--   * concurrency / serialization: the account row is taken FOR UPDATE so a
--     sequence of orders never drives cash or shares negative (Req 8.8),
--   * ledger invariants: cash + sum(cost basis of open positions) is conserved
--     by a round-trip, and an order row is written in the same transaction as
--     the cash/position change (Req 8.4).
--
-- The RPC is SECURITY DEFINER and derives the user from current_user_id(). Tests
-- set the JWT claims via _helpers.sql, act as the `authenticated` client role,
-- and seed instruments/quotes/accounts/unlocks as the privileged owner (which
-- bypasses RLS). Quotes are seeded with updated_at = now() so the open-market
-- stale check never fires, keeping every case deterministic regardless of the
-- wall clock / whether the market happens to be open when the suite runs.

begin;
select plan(39);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Config the RPC reads. Re-assert the values locally so the function exercises
-- its real (non-fallback) paths regardless of seed state. ON CONFLICT keeps any
-- seeded row (values match supabase/seed/seed.sql).
-- ---------------------------------------------------------------------------
insert into public.app_config(key, value) values
  ('starter_cash_cents', '1000000'),
  ('starter_position_cap_cents', '100000'),
  ('quote_stale_minutes', '30')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Instruments: one starter and one non-starter (full-universe gate). Quotes are
-- fresh (updated_at = now()) so the open-market stale check never trips.
-- $100.00/share starter; $50.00/share non-starter.
-- ---------------------------------------------------------------------------
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
values
  ('AAA', 'Alpha Co',  'stock', 'Tech',    true,  true, 1),
  ('ZZZ', 'Zeta Corp', 'stock', 'Finance', false, true, 2);

insert into public.quotes(symbol, price_cents, prev_close_cents, as_of, is_delayed, source, updated_at)
values
  ('AAA', 10000, 9900, now(), true, 'test', now()),
  ('ZZZ',  5000, 4900, now(), true, 'test', now());

-- Compute "now" once for seeded timestamps that must look fresh.
-- (now() inside the inserts above already does this; nothing to \gset here.)

-- ===========================================================================
-- User A: feature gating.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userA', 1000000, 1000000);

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- No unlocks yet: a buy is feature_locked.
select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-A-buy-locked') $$,
  'feature_locked',
  'a buy without market_buy raises feature_locked');

reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'market_buy');
set role authenticated;

-- Has buy unlock but not sell: a sell is still feature_locked.
select throws_ok(
  $$ select public.place_market_order('AAA', 'sell', 1, 'idem-A-sell-locked') $$,
  'feature_locked',
  'a sell without market_sell raises feature_locked');

-- A non-starter symbol without full_universe is not available.
select throws_ok(
  $$ select public.place_market_order('ZZZ', 'buy', 1, 'idem-A-nonstarter') $$,
  'symbol_not_available',
  'a non-starter symbol without full_universe raises symbol_not_available');

-- ===========================================================================
-- User B: insufficient cash.
-- B can only afford 1 share of AAA ($100). A 2-share buy ($200) overdraws.
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userB', 'blue-owl-22', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userB', 15000, 15000);  -- $150.00
insert into public.user_unlocks(user_id, feature_key) values
  ('auth0|userB', 'market_buy'), ('auth0|userB', 'market_sell');

reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 2, 'idem-B-overdraw') $$,
  'insufficient_cash',
  'a buy that costs more than available cash raises insufficient_cash');

reset role;
select is((select cash_cents from public.paper_accounts where user_id='auth0|userB'),
  15000::bigint, 'a rejected buy leaves cash untouched');
select is((select count(*)::int from public.orders where user_id='auth0|userB'),
  0, 'a rejected buy writes no order row');

-- ===========================================================================
-- User C: position cap. starter_position_cap_cents = 100000 ($1000). At $100/sh
-- that is exactly 10 shares. 11 shares (110000) exceeds the cap.
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userC', 'gray-elk-33', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userC', 1000000, 1000000);
insert into public.user_unlocks(user_id, feature_key) values
  ('auth0|userC', 'market_buy'), ('auth0|userC', 'market_sell');

reset role;
select tests.set_authenticated_claims('auth0|userC');
set role authenticated;

-- 11 shares * $100 = $1100 > $1000 cap -> rejected.
select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 11, 'idem-C-overcap') $$,
  'position_cap_exceeded',
  'a buy that pushes the position past the starter cap raises position_cap_exceeded');

-- Exactly at the cap (10 shares = $1000) is allowed (cap is a strict > check).
select lives_ok(
  $$ select public.place_market_order('AAA', 'buy', 10, 'idem-C-atcap') $$,
  'a buy that lands exactly on the cap is allowed');

reset role;
select is((select qty from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userC') and symbol='AAA'),
  10::bigint, 'the at-cap buy created a 10-share position');

-- Any further buy now exceeds the cap (already at 10 shares)...
set role authenticated;
select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-C-oneover') $$,
  'position_cap_exceeded',
  'adding to a position already at the cap raises position_cap_exceeded');

-- ...unless the user has raise_cap.
reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userC', 'raise_cap');
set role authenticated;
select lives_ok(
  $$ select public.place_market_order('AAA', 'buy', 5, 'idem-C-raisecap') $$,
  'raise_cap lets a buy exceed the starter cap');

reset role;
select is((select qty from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userC') and symbol='AAA'),
  15::bigint, 'the raise-cap buy added 5 shares (now 15)');

-- ===========================================================================
-- User D: idempotency. The same key must return the ORIGINAL order and move
-- cash/shares exactly once (Req 8.5).
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userD', 'pink-jay-44', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userD', 1000000, 1000000);
insert into public.user_unlocks(user_id, feature_key) values
  ('auth0|userD', 'market_buy'), ('auth0|userD', 'market_sell');

reset role;
select tests.set_authenticated_claims('auth0|userD');
set role authenticated;

-- First call: buy 3 shares ($300). Capture the order id.
select (public.place_market_order('AAA', 'buy', 3, 'idem-D-dupe')).id as d_order_id \gset
-- Second call with the SAME key returns the same order id.
select is(
  (select (public.place_market_order('AAA', 'buy', 3, 'idem-D-dupe')).id),
  (:'d_order_id')::uuid,
  'a repeat with the same idempotency key returns the original order');

reset role;
select is((select cash_cents from public.paper_accounts where user_id='auth0|userD'),
  (1000000 - 30000)::bigint, 'cash moved exactly once for the duplicate submit ($300 debited)');
select is((select qty from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userD') and symbol='AAA'),
  3::bigint, 'shares moved exactly once for the duplicate submit (3 shares)');
select is((select count(*)::int from public.orders where user_id='auth0|userD' and idempotency_key='idem-D-dupe'),
  1, 'exactly one order row exists for the duplicated idempotency key');

-- ===========================================================================
-- User E: partial and full sells, realized P&L rounding, and invariants.
-- Buy 3 @ $100 (basis 30000). Price then rises to $150 for the sells.
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userE', 'teal-ram-55', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userE', 1000000, 1000000);
insert into public.user_unlocks(user_id, feature_key) values
  ('auth0|userE', 'market_buy'), ('auth0|userE', 'market_sell');

reset role;
select tests.set_authenticated_claims('auth0|userE');
set role authenticated;
select public.place_market_order('AAA', 'buy', 3, 'idem-E-buy');

-- Raise the price to $150 before selling (as owner; quote is reference data).
reset role;
update public.quotes set price_cents = 15000, updated_at = now() where symbol = 'AAA';

-- Buy orders carry no realized P&L.
select is((select realized_pl_cents from public.orders where user_id='auth0|userE' and idempotency_key='idem-E-buy'),
  null, 'a buy order has null realized_pl_cents');

-- Partial sell: 1 of 3 shares at $150. Proceeds 15000; basis removed =
-- round(30000 * 1 / 3) = 10000; realized = 15000 - 10000 = 5000.
set role authenticated;
select is(
  (select (public.place_market_order('AAA', 'sell', 1, 'idem-E-sell-partial')).realized_pl_cents),
  5000::bigint,
  'partial sell realizes proceeds minus proportional (rounded) cost basis');

reset role;
select is((select qty from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userE') and symbol='AAA'),
  2::bigint, 'partial sell leaves 2 shares');
select is((select cost_basis_cents from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userE') and symbol='AAA'),
  20000::bigint, 'partial sell removes the proportional basis (30000 - 10000 = 20000)');

-- Full sell of the remaining 2 shares at $150: proceeds 30000; the FULL basis
-- (20000) is removed exactly (no rounding residual); realized = 10000.
set role authenticated;
select is(
  (select (public.place_market_order('AAA', 'sell', 2, 'idem-E-sell-full')).realized_pl_cents),
  10000::bigint,
  'full sell removes the whole basis exactly and realizes the remainder');

reset role;
select is((select count(*)::int from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userE') and symbol='AAA'),
  0, 'a full sell deletes the position row');

-- Ledger/round-trip invariant: bought 3 @ $100, sold 3 @ $150. Net cash change
-- = -30000 + 15000 + 30000 = +15000 over starting cash, and no position remains.
select is((select cash_cents from public.paper_accounts where user_id='auth0|userE'),
  (1000000 + 15000)::bigint, 'round-trip cash equals starting cash plus total realized P&L');

-- A sell beyond the shares held is rejected (no negative shares, Req 8.8).
set role authenticated;
select throws_ok(
  $$ select public.place_market_order('AAA', 'sell', 1, 'idem-E-oversell') $$,
  'insufficient_shares',
  'selling more shares than held raises insufficient_shares');

-- ===========================================================================
-- User F: realized P&L rounding on a non-even basis split. Build a position of
-- 3 shares with a total basis of 1666 cents (1 @ $10.00 = 1000, then 2 @ $3.33
-- = 666). Selling 1 share removes round(1666 * 1 / 3) = round(555.33) = 555,
-- proving the proportional basis is rounded to the nearest cent. Selling the
-- remaining 2 then removes the whole remaining basis (1111) exactly, so a
-- closed position never leaves a residual cent.
-- ===========================================================================
reset role;
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
  values ('BBB', 'Beta Co', 'stock', 'Tech', true, true, 3);
insert into public.quotes(symbol, price_cents, prev_close_cents, as_of, is_delayed, source, updated_at)
  values ('BBB', 1000, 1000, now(), true, 'test', now());  -- $10.00 to start

insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userF', 'cyan-doe-66', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userF', 1000000, 1000000);
insert into public.user_unlocks(user_id, feature_key) values
  ('auth0|userF', 'market_buy'), ('auth0|userF', 'market_sell');

reset role;
select tests.set_authenticated_claims('auth0|userF');
set role authenticated;

-- Buy 1 @ $10.00 (basis 1000), then lower the quote to $3.33 and buy 2 more
-- (+666), leaving a 3-share position with a total basis of 1666 cents.
select public.place_market_order('BBB', 'buy', 1, 'idem-F-buy1');
reset role;
update public.quotes set price_cents = 333, updated_at = now() where symbol = 'BBB';
set role authenticated;
select public.place_market_order('BBB', 'buy', 2, 'idem-F-buy2');  -- +666, basis 1666, qty 3

reset role;
select is((select cost_basis_cents from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userF') and symbol='BBB'),
  1666::bigint, 'accumulated cost basis is 1000 + 666 = 1666 over 3 shares');

-- Sell 1 at the current $3.33: proceeds 333; basis removed = round(1666/3) =
-- round(555.33..) = 555; realized = 333 - 555 = -222.
set role authenticated;
select is(
  (select (public.place_market_order('BBB', 'sell', 1, 'idem-F-sell1')).realized_pl_cents),
  -222::bigint,
  'realized P&L rounds the proportional basis to the nearest cent (round-half behavior)');

reset role;
select is((select cost_basis_cents from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userF') and symbol='BBB'),
  1111::bigint, 'remaining basis after removing the rounded 555 is 1666 - 555 = 1111');
select is((select qty from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userF') and symbol='BBB'),
  2::bigint, 'two shares remain after the partial sell');

-- Selling the final 2 removes the WHOLE remaining basis (1111) exactly, leaving
-- no residual cent on a now-closed position.
set role authenticated;
select public.place_market_order('BBB', 'sell', 2, 'idem-F-sell2');
reset role;
select is((select count(*)::int from public.positions where account_id=(select id from public.paper_accounts where user_id='auth0|userF') and symbol='BBB'),
  0, 'the final sell closes the position with no residual basis row');

-- ===========================================================================
-- User G: serialization / concurrency invariant (Req 8.8). The account row is
-- locked FOR UPDATE, so a sequence of orders is processed one after another and
-- cash/shares never go negative. Simulate a burst of buys that in aggregate
-- would overdraw: the account can afford exactly 1 share ($100); the second buy
-- must fail and the balances must stay non-negative and consistent.
-- ===========================================================================
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userG', 'lime-fox-77', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userG', 10000, 10000);  -- $100.00, affords exactly 1 share
insert into public.user_unlocks(user_id, feature_key) values
  ('auth0|userG', 'market_buy'), ('auth0|userG', 'market_sell');

reset role;
update public.quotes set price_cents = 10000, updated_at = now() where symbol = 'AAA';
select tests.set_authenticated_claims('auth0|userG');
set role authenticated;

select lives_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-G-first') $$,
  'the first affordable buy succeeds');
select throws_ok(
  $$ select public.place_market_order('AAA', 'buy', 1, 'idem-G-second') $$,
  'insufficient_cash',
  'the next buy with no remaining cash is rejected (serialized, no overdraw)');

reset role;
select ok((select cash_cents from public.paper_accounts where user_id='auth0|userG') >= 0,
  'cash never goes negative under a burst of orders (Req 8.8)');
select is((select cash_cents from public.paper_accounts where user_id='auth0|userG'),
  0::bigint, 'cash is exactly zero after the single affordable buy');
select ok(
  not exists (select 1 from public.positions where qty < 0 or cost_basis_cents < 0),
  'no position ever holds negative shares or negative cost basis');

-- Confirm the function actually serializes via a row lock (FOR UPDATE on the
-- account) rather than relying on timing: assert the source contains the lock.
select ok(
  (select pg_get_functiondef('public.place_market_order(text,text,bigint,text,text[],text)'::regprocedure)
     ilike '%paper_accounts where user_id = v_uid for update%'),
  'place_market_order locks the account row FOR UPDATE to serialize orders');

-- ===========================================================================
-- Order-row invariants (Req 8.4): a filled order records fill price, total, and
-- a valid price source, and the price never came from the client.
-- ===========================================================================
select is((select fill_price_cents from public.orders where idempotency_key='idem-D-dupe'),
  10000::bigint, 'the order records the server-side fill price (client sent none)');
select is((select total_cents from public.orders where idempotency_key='idem-D-dupe'),
  30000::bigint, 'the order records total = fill price * qty');
select ok(
  (select price_source from public.orders where idempotency_key='idem-D-dupe') in ('delayed_quote','last_close'),
  'the order records a valid price_source (delayed_quote open / last_close closed)');
select is((select status from public.orders where idempotency_key='idem-D-dupe'),
  'filled', 'a successful order is marked filled');

select * from finish();
rollback;

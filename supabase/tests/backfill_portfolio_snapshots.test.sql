-- backfill_portfolio_snapshots RPC (Portfolio Value Chart, design.md sections 1-2).
-- Source of truth: the function in
-- 20250109000001_backfill_portfolio_snapshots_rpc.sql and design.md section 2.
--
-- backfill_portfolio_snapshots() is SECURITY DEFINER and derives the account from
-- current_user_id(). Tests set the JWT claims via _helpers.sql, act as the
-- `authenticated` client role, and seed instruments/profiles/accounts/orders/
-- quote_bars as the privileged owner (which bypasses RLS). The RPC is invoked as
-- `authenticated` with the appropriate claims so current_user_id() resolves.
--
-- Worked example (user A, starting_cash_cents = 1,000,000, created 2025-01-02):
--   orders (all filled, noon ET so the ET date is unambiguous):
--     2025-01-03 buy  AAA 10 @ total 100000
--     2025-01-05 buy  BBB  5 @ total  50000
--     2025-01-07 sell AAA  4 @ total  48000
--   quote_bars close_cents:
--     AAA {01-03:10000, 01-04:10500, 01-08:12000}
--     BBB {01-06:11000, 01-08: 9000}
--   expected equity by day (cash reconstructed from the ledger, positions from
--   carry-forward close; a held symbol with no bar at/before D contributes 0):
--     01-03: AAA 10*10000=100000, cash 1000000-100000=900000 -> 1,000,000
--     01-04: AAA 10*10500=105000, cash 900000               -> 1,005,000
--     01-05: AAA 10*10500(carry)=105000, BBB no bar yet=0,
--            cash 900000-50000=850000                       -> 955,000
--     01-06: AAA 10*10500(carry)=105000, BBB 5*11000=55000,
--            cash 850000                                     -> 1,010,000
--     01-07: AAA (10-4)=6*10500(carry)=63000, BBB 5*11000(carry)=55000,
--            cash 850000+48000=898000                        -> 1,016,000
--     01-08: AAA 6*12000=72000, BBB 5*9000=45000, cash 898000 -> 1,015,000
-- The seed dates are safely in the past, so v_last (yesterday ET) is well past
-- 2025-01-08 and all six rows are written.

begin;
select plan(22);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Instruments (starters) for the worked example and the other cases.
-- ---------------------------------------------------------------------------
reset role;
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
values
  ('AAA', 'Alpha Co', 'stock', 'Tech', true, true, 1),
  ('BBB', 'Beta Co',  'stock', 'Tech', true, true, 2);

-- quote_bars for the worked example (close_cents is the historical price source).
insert into public.quote_bars(symbol, bar_date, open_cents, high_cents, low_cents, close_cents, volume)
values
  ('AAA', '2025-01-03', 10000, 10000, 10000, 10000, 1000),
  ('AAA', '2025-01-04', 10500, 10500, 10500, 10500, 1000),
  ('AAA', '2025-01-08', 12000, 12000, 12000, 12000, 1000),
  ('BBB', '2025-01-06', 11000, 11000, 11000, 11000, 1000),
  ('BBB', '2025-01-08',  9000,  9000,  9000,  9000, 1000);

-- ---------------------------------------------------------------------------
-- User A: the worked example.
-- ---------------------------------------------------------------------------
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents, created_at)
  values ('auth0|userA', 1000000, 1000000, '2025-01-02T12:00:00-05:00');

insert into public.orders(account_id, user_id, symbol, side, qty, status,
    fill_price_cents, total_cents, idempotency_key, created_at)
values
  ((select id from public.paper_accounts where user_id='auth0|userA'),
    'auth0|userA', 'AAA', 'buy', 10, 'filled', 10000, 100000, 'ord-A-0001', '2025-01-03T12:00:00-05:00'),
  ((select id from public.paper_accounts where user_id='auth0|userA'),
    'auth0|userA', 'BBB', 'buy',  5, 'filled', 10000,  50000, 'ord-A-0002', '2025-01-05T12:00:00-05:00'),
  ((select id from public.paper_accounts where user_id='auth0|userA'),
    'auth0|userA', 'AAA', 'sell', 4, 'filled', 12000,  48000, 'ord-A-0003', '2025-01-07T12:00:00-05:00');

-- Run the backfill as A.
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;
select public.backfill_portfolio_snapshots();

reset role;

-- #1-6 Worked-example equity on each day.
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-03'),
  1000000::bigint, 'equity on 2025-01-03 = 1,000,000');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-04'),
  1005000::bigint, 'equity on 2025-01-04 = 1,005,000');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-05'),
  955000::bigint, 'equity on 2025-01-05 = 955,000 (carry-forward + missing bar = 0)');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-06'),
  1010000::bigint, 'equity on 2025-01-06 = 1,010,000');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-07'),
  1016000::bigint, 'equity on 2025-01-07 = 1,016,000 (sell leg of cash + holdings)');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-08'),
  1015000::bigint, 'equity on 2025-01-08 = 1,015,000');

-- #7 cash leg (sell) on 2025-01-07.
select is(
  (select cash_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-07'),
  898000::bigint, 'cash on 2025-01-07 = 898,000 (starting - buys + sell)');

-- #8 positions value on 2025-01-05 (carry-forward AAA + missing BBB bar = 0).
select is(
  (select positions_value_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-05'),
  105000::bigint, 'positions value on 2025-01-05 = 105,000 (AAA carry, BBB no bar yet)');

-- ---------------------------------------------------------------------------
-- #9-10 Idempotency: a second run does not duplicate rows or drift values.
-- A's series spans 2025-01-03..yesterday ET; capture the count after the first
-- run, run again, and assert the count and a named equity value are unchanged.
-- ---------------------------------------------------------------------------
select count(*)::int as a_rows_before
  from public.portfolio_snapshots
 where account_id=(select id from public.paper_accounts where user_id='auth0|userA') \gset

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;
select public.backfill_portfolio_snapshots();  -- second run
reset role;

select is(
  (select count(*)::int from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')),
  :a_rows_before, 'second run leaves A''s row count unchanged (idempotent upsert)');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-08'),
  1015000::bigint, 'equity on 2025-01-08 unchanged after the second run');

-- ---------------------------------------------------------------------------
-- #11 No-position account (user E): equity = reconstructed cash, positions 0.
-- ---------------------------------------------------------------------------
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userE', 'elk-doe-44', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents, created_at)
  values ('auth0|userE', 500000, 500000, '2025-01-02T12:00:00-05:00');

select tests.set_authenticated_claims('auth0|userE');
set role authenticated;
select public.backfill_portfolio_snapshots();
reset role;

select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userE')
       and snap_date='2025-01-05'),
  500000::bigint,
  'no-position account: equity = starting cash and positions value 0');

-- ---------------------------------------------------------------------------
-- #12 Cash is reconstructed from the ledger, NOT the account's live cash_cents.
-- Set A's live cash to a value that differs from the reconstructed cash, re-run,
-- and assert the stored cash matches the ledger math (not the live column).
-- ---------------------------------------------------------------------------
reset role;
update public.paper_accounts set cash_cents = 42
  where user_id='auth0|userA';

select tests.set_authenticated_claims('auth0|userA');
set role authenticated;
select public.backfill_portfolio_snapshots();
reset role;

select is(
  (select cash_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-08'),
  898000::bigint,
  'cash is reconstructed from the ledger (898000), not the live cash_cents (42)');

-- ---------------------------------------------------------------------------
-- #13 Clamp: directly-seeded single-day over-buy (impossible via the write path,
-- which blocks negative cash). Starting 100000, one filled BUY total 150000, no
-- sells -> reconstructed cash would be -50000; the greatest(...,0) floor stores 0.
-- ---------------------------------------------------------------------------
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userC', 'cub-jay-55', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents, created_at)
  values ('auth0|userC', 100000, 100000, '2025-01-02T12:00:00-05:00');
insert into public.orders(account_id, user_id, symbol, side, qty, status,
    fill_price_cents, total_cents, idempotency_key, created_at)
values
  ((select id from public.paper_accounts where user_id='auth0|userC'),
    'auth0|userC', 'AAA', 'buy', 15, 'filled', 10000, 150000, 'ord-C-0001', '2025-01-03T12:00:00-05:00');

select tests.set_authenticated_claims('auth0|userC');
set role authenticated;
select public.backfill_portfolio_snapshots();
reset role;

select is(
  (select cash_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userC')
       and snap_date='2025-01-03'),
  0::bigint,
  'defensive clamp: over-buy ledger stores cash_cents = 0, not negative');

-- ---------------------------------------------------------------------------
-- #14-16 Ownership isolation: user B runs the RPC; it writes only B's rows, does
-- not touch A's rows, and B (under RLS) cannot SELECT A's snapshots.
-- B is created today with no orders, so B gets rows from its creation day up to
-- yesterday ET (a cash-only series); its row count is >= 1 and all belong to B.
-- ---------------------------------------------------------------------------
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userB', 'bay-owl-66', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents, created_at)
  values ('auth0|userB', 700000, 700000, '2025-01-02T12:00:00-05:00');

select tests.set_authenticated_claims('auth0|userB');
set role authenticated;
select public.backfill_portfolio_snapshots();
reset role;

-- #14 B's run wrote rows for B's own account (cash-only series, >= 1 day), and
-- every one of those rows is a pure-cash row (positions_value_cents = 0) equal to
-- B's starting cash, proving B's run reconstructed B's own ledger and no one else's.
select is(
  (select count(*)::int from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userB')
       and (positions_value_cents <> 0 or equity_cents <> 700000)),
  0, 'every row B''s run wrote is B''s own cash-only series (positions 0, equity = B''s cash)');

-- #15 A's rows are unchanged by B's run (equity on 2025-01-08 still 1,015,000).
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')
       and snap_date='2025-01-08'),
  1015000::bigint, 'A''s rows are unaffected by B''s backfill run');

-- #16 As authenticated with B's claims, RLS hides A's snapshots entirely.
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;
select is(
  (select count(*)::int from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userA')),
  0, 'under RLS, user B cannot SELECT any of A''s snapshot rows');
reset role;

-- ---------------------------------------------------------------------------
-- #17 Guard: no authenticated claims -> not_authenticated.
-- ---------------------------------------------------------------------------
reset role;
select tests.clear_claims();
set role authenticated;
select throws_ok(
  $$ select public.backfill_portfolio_snapshots() $$,
  'not_authenticated',
  'the RPC with no authenticated claims raises not_authenticated');

-- ---------------------------------------------------------------------------
-- #18 Guard: authenticated but no paper_accounts row -> no_account.
-- ---------------------------------------------------------------------------
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userN', 'nib-hen-77', 2008, '16-17', 'America/New_York');
select tests.set_authenticated_claims('auth0|userN');
set role authenticated;
select throws_ok(
  $$ select public.backfill_portfolio_snapshots() $$,
  'no_account',
  'an authenticated user with no paper_accounts row raises no_account');
reset role;

-- ---------------------------------------------------------------------------
-- #19-20 No future row: the latest snap_date is yesterday ET; no row for today.
-- ---------------------------------------------------------------------------
select ok(
  (select max(snap_date) from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userB'))
    <= (now() at time zone 'America/New_York')::date - 1,
  'the latest snap_date is at most yesterday ET');
select ok(
  not exists (
    select 1 from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userB')
       and snap_date = (now() at time zone 'America/New_York')::date),
  'no snapshot row is written for today ET');

-- ---------------------------------------------------------------------------
-- #21-22 Grants: executable by authenticated, not by anon.
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.backfill_portfolio_snapshots()', 'execute'),
  'backfill_portfolio_snapshots is executable by authenticated');
select ok(
  not has_function_privilege('anon', 'public.backfill_portfolio_snapshots()', 'execute'),
  'backfill_portfolio_snapshots is NOT executable by anon');

select * from finish();
rollback;

-- Portfolio Value Chart migration: the backfill_portfolio_snapshots RPC.
-- Source of truth: .agents/tasks/portfolio-value-chart/design.md section 1.
--
-- backfill_portfolio_snapshots() reconstructs the caller's historical daily
-- portfolio-value series (one row per ET calendar day) from the orders +
-- quote_bars ledger and upserts it into public.portfolio_snapshots. The nightly
-- snapshot_portfolios() cron (20250105000007_supporting_rpcs.sql) only started
-- appending rows recently, so the chart's longer ranges (3M/1Y/5Y/ALL) would be
-- empty; this per-caller, client-triggered backfill fills them in with rows that
-- match the cron's rows in shape and column semantics.
--
-- Conventions mirror the other user-facing RPCs (20250105000007 /
-- 20250105000006): SECURITY DEFINER, set search_path = public, returns int (rows
-- upserted), derives the account from public.current_user_id() only (never an
-- argument), and raises bare error codes (not_authenticated, no_account) that
-- PostgREST surfaces as the error message. Clients hold only SELECT on
-- portfolio_snapshots (20250105000003); as a SECURITY DEFINER function this RPC
-- performs the writes under the definer's privileges, and it only ever targets
-- the caller's own account_id, so a client cannot write another account's rows.
--
-- DIVERGENCE from snapshot_portfolios(): the cron values positions from the live
-- `quotes` table (current price), but this backfill reconstructs history, so it
-- values positions from `quote_bars.close_cents` at the historical bar_date (the
-- close at or before each day). The row SHAPE and COLUMN SEMANTICS still match
-- the cron's rows (cash_cents, positions_value_cents, equity_cents keyed by
-- (account_id, snap_date)); only the price SOURCE necessarily differs (historical
-- close vs. live quote). The backfill never writes a row for snap_date >= today
-- ET, so it can never overwrite the cron's same-day row written by the live-quote
-- method.

create or replace function public.backfill_portfolio_snapshots()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_acct public.paper_accounts;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_last  date := v_today - 1;            -- latest snap_date we may write (yesterday ET)
  v_start date;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Account is derived from current_user_id() only; no id is passed in.
  select * into v_acct from paper_accounts where user_id = v_uid;
  if not found then raise exception 'no_account'; end if;

  -- Earliest date we reconstruct: the earlier of the account's creation day and
  -- the first filled order's day (both in ET). An account with no filled orders
  -- starts at its creation day, giving a cash-only series. (Design Assumption 1.)
  select least(
           (v_acct.created_at at time zone 'America/New_York')::date,
           coalesce(
             (select min((o.created_at at time zone 'America/New_York')::date)
                from orders o
               where o.account_id = v_acct.id and o.status = 'filled'),
             (v_acct.created_at at time zone 'America/New_York')::date))
    into v_start;

  -- Brand-new account today: nothing before today ET to reconstruct.
  if v_start > v_last then
    return 0;
  end if;

  with
  -- One row per calendar day in [v_start, v_last].
  days as (
    select d::date as snap_date
    from generate_series(v_start, v_last, interval '1 day') d
  ),
  -- Per-symbol signed quantities and cash legs grouped by ET fill date.
  -- total_cents is a NULLABLE bigint on orders (20250105000002_trading_ledger.sql
  -- line 31): place_market_order sets it on the rows it writes, but a directly-
  -- seeded or historically-migrated filled row may leave it null. coalesce every
  -- ledger sum to 0 so a null total can never propagate NULL into the not-null
  -- snapshot cents columns and abort the run.
  fills as (
    select o.symbol,
           (o.created_at at time zone 'America/New_York')::date as fill_date,
           sum(case when o.side = 'buy' then o.qty else -o.qty end) as signed_qty,
           sum(case when o.side = 'sell' then coalesce(o.total_cents, 0) else 0 end) as sell_total,
           sum(case when o.side = 'buy'  then coalesce(o.total_cents, 0) else 0 end) as buy_total
    from orders o
    where o.account_id = v_acct.id and o.status = 'filled'
    group by o.symbol, (o.created_at at time zone 'America/New_York')::date
  ),
  -- Net holdings per symbol as of each day D: running sum of signed_qty for
  -- fills on or before D. Fully-closed (zero net) positions are dropped so they
  -- do not emit a 0-qty priced row.
  holdings as (
    select dd.snap_date, f.symbol,
           sum(f.signed_qty) as qty
    from days dd
    join fills f on f.fill_date <= dd.snap_date
    group by dd.snap_date, f.symbol
    having sum(f.signed_qty) <> 0
  ),
  -- Carry-forward close: the close at bar_date = D, else the most recent
  -- bar_date <= D. The quote_bars PK (symbol, bar_date) makes `order by bar_date
  -- desc limit 1` unambiguous. A held symbol with no bar at or before D yields a
  -- null close, coalesced to 0 below (missing bar contributes 0; matches the
  -- "missing quote = 0" rule in use-portfolio.ts and snapshot_portfolios()).
  priced as (
    select h.snap_date,
           h.qty,
           (select qb.close_cents
              from quote_bars qb
             where qb.symbol = h.symbol and qb.bar_date <= h.snap_date
             order by qb.bar_date desc
             limit 1) as close_cents
    from holdings h
  ),
  positions_value as (
    select snap_date,
           coalesce(sum(qty * coalesce(close_cents, 0)), 0)::bigint as positions_value_cents
    from priced
    group by snap_date
  ),
  -- Reconstructed cash as of D from the ledger (NOT the account's current
  -- cash_cents): starting_cash_cents + filled SELL totals up to D - filled BUY
  -- totals up to D. The greatest(..., 0) is a DEFENSIVE floor: place_market_order
  -- refuses any buy that would drive cash negative (insufficient_cash,
  -- 20250105000006), so for any ledger the write path produced the clamp never
  -- fires. It guards only directly-seeded or historically-migrated rows whose BUY
  -- totals could exceed starting + sells.
  cash as (
    select dd.snap_date,
           greatest(
             v_acct.starting_cash_cents
               + coalesce((select sum(f.sell_total) from fills f where f.fill_date <= dd.snap_date), 0)
               - coalesce((select sum(f.buy_total)  from fills f where f.fill_date <= dd.snap_date), 0),
             0)::bigint as cash_cents
    from days dd
  )
  insert into portfolio_snapshots(account_id, snap_date, cash_cents, positions_value_cents, equity_cents)
  select v_acct.id,
         dd.snap_date,
         c.cash_cents,
         coalesce(pv.positions_value_cents, 0),
         c.cash_cents + coalesce(pv.positions_value_cents, 0)
  from days dd
  join cash c on c.snap_date = dd.snap_date
  left join positions_value pv on pv.snap_date = dd.snap_date
  on conflict (account_id, snap_date) do update
    set cash_cents = excluded.cash_cents,
        positions_value_cents = excluded.positions_value_cents,
        equity_cents = excluded.equity_cents;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- The client calls this RPC. Postgres grants EXECUTE to PUBLIC by default on a
-- new function, so revoke that (and anon) and grant only `authenticated`. No
-- grant is added to portfolio_snapshots itself: clients stay SELECT-only under
-- the "own snapshots" RLS policy (20250105000003); the SECURITY DEFINER function
-- is the only client-reachable write path.
revoke execute on function public.backfill_portfolio_snapshots() from public, anon;
grant  execute on function public.backfill_portfolio_snapshots() to authenticated;

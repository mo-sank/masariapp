-- Market data and paper trading migration (1/2): market-data tables.
-- Source of truth: docs/db-and-api-reference.md section 3.3.
--
-- Creates the delayed-quote and price-history tables (quotes, quote_bars),
-- the trading-calendar table (market_holidays), and the market_is_open()
-- helper function. The instruments table already exists (foundation spec,
-- 20250103000003_instruments.sql) and is the FK target for quotes/quote_bars.
-- RLS policies and grants for these tables are added in a later migration in
-- this spec (20250105000003_market_trading_rls_and_grants.sql), not here.
-- pgTAP tests for market_is_open are added by task 3.

create table public.quotes (
  symbol text primary key references public.instruments(symbol),
  price_cents bigint not null check (price_cents > 0),
  prev_close_cents bigint,
  open_cents bigint,
  high_cents bigint,
  low_cents bigint,
  volume bigint,
  as_of timestamptz not null,                     -- provider timestamp
  is_delayed boolean not null default true,
  source text not null,
  updated_at timestamptz not null default now()   -- when we wrote the row
);

create table public.quote_bars (
  symbol text not null references public.instruments(symbol),
  bar_date date not null,
  open_cents bigint not null,
  high_cents bigint not null,
  low_cents bigint not null,
  close_cents bigint not null,
  volume bigint,
  primary key (symbol, bar_date)
);

create table public.market_holidays (
  holiday_date date primary key,
  name text not null,
  is_early_close boolean not null default false
);

-- Returns true when the US equity market is open at p_at (evaluated in
-- America/New_York). Weekends are closed. A full-day holiday is closed; an
-- early-close day closes at 13:00 ET instead of 16:00 ET. Regular hours are
-- 09:30 ET (inclusive) to 16:00 ET (exclusive).
create or replace function public.market_is_open(p_at timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  v_local timestamp := p_at at time zone 'America/New_York';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_close time := time '16:00';
  v_h public.market_holidays;
begin
  if extract(isodow from v_date) > 5 then return false; end if;
  select * into v_h from public.market_holidays where holiday_date = v_date;
  if found then
    if not v_h.is_early_close then return false; end if;
    v_close := time '13:00';
  end if;
  return v_time >= time '09:30' and v_time < v_close;
end $$;

-- Market data and paper trading migration (2/2): trading-ledger tables.
-- Source of truth: docs/db-and-api-reference.md section 3.4.
--
-- paper_accounts already exists (foundation spec, 20250103000004_account_tables.sql),
-- so it is not recreated here. This migration adds the remaining ledger tables:
-- positions, orders, trade_reflections, watchlist_items, portfolio_snapshots.
-- RLS policies and grants for these tables are added in a later migration in
-- this spec (20250105000003_market_trading_rls_and_grants.sql), not here. The
-- place_market_order / submit_reflection / watchlist_* / snapshot_portfolios
-- RPCs that write these tables are added by later tasks (6 and 7).

create table public.positions (
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  symbol text not null references public.instruments(symbol),
  qty bigint not null check (qty > 0),
  cost_basis_cents bigint not null check (cost_basis_cents > 0),  -- TOTAL cost, not per share
  updated_at timestamptz not null default now(),
  primary key (account_id, symbol)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  symbol text not null references public.instruments(symbol),
  side text not null check (side in ('buy','sell')),
  order_type text not null default 'market' check (order_type in ('market')),
  qty bigint not null check (qty > 0),
  status text not null default 'filled' check (status in ('filled','pending','cancelled')),
  fill_price_cents bigint,
  total_cents bigint,
  realized_pl_cents bigint,
  price_as_of timestamptz,
  price_source text check (price_source in ('delayed_quote','last_close')),
  rationale_tags text[] not null default '{}',
  rationale_text text check (char_length(rationale_text) <= 280),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);
create index orders_account_created_idx on public.orders(account_id, created_at desc);

create table public.trade_reflections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  expectation text not null check (expectation in ('better','as_expected','worse')),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);

create table public.watchlist_items (
  user_id text not null references public.profiles(user_id) on delete cascade,
  symbol text not null references public.instruments(symbol),
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table public.portfolio_snapshots (
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  snap_date date not null,
  cash_cents bigint not null,
  positions_value_cents bigint not null,
  equity_cents bigint not null,
  primary key (account_id, snap_date)
);

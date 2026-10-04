-- Foundation migration: paper trading account tables.
-- Source of truth: docs/db-and-api-reference.md section 3.4 (account tables only:
-- paper_accounts) and section 3.5 (user_stats). Only the account-level tables this
-- spec owns are created here. positions, orders, watchlist_items, and
-- portfolio_snapshots belong to later specs.
-- RLS policies and grants are added in a later task (section 4), not here.

create table public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles(user_id) on delete cascade,
  cash_cents bigint not null check (cash_cents >= 0),
  starting_cash_cents bigint not null,
  created_at timestamptz not null default now()
);

create table public.user_stats (
  user_id text primary key references public.profiles(user_id) on delete cascade,
  xp_total int not null default 0,
  streak_current int not null default 0,
  streak_longest int not null default 0,
  last_active_date date,
  streak_freezes int not null default 0 check (streak_freezes between 0 and 3)
);

-- Foundation migration: instruments reference table.
-- Source of truth: docs/db-and-api-reference.md section 3.3 (instruments table only).
-- Only the instruments table is created here; it is the FK target later specs
-- (quotes, quote_bars, positions, orders, watchlist_items) depend on. The other
-- market-data tables belong to later specs.
-- RLS policies and grants are added in a later task (section 4), not here.

create table public.instruments (
  symbol text primary key,
  name text not null,
  type text not null default 'stock' check (type in ('stock','etf')),
  sector text,
  is_starter boolean not null default false,
  is_active boolean not null default true,
  sort_order int
);

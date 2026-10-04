-- Seed data loaded after migrations on `supabase db reset`.
-- Source of truth: docs/db-and-api-reference.md sections 3.1 and 9.
-- This spec seeds app_config only. instruments.csv / holidays.csv are seeded by
-- later tasks.

insert into public.app_config(key, value) values
  ('min_age', '13'),
  ('starter_cash_cents', '1000000'),
  ('starter_position_cap_cents', '100000'),
  ('watchlist_max', '5'),
  ('quote_stale_minutes', '30')
on conflict (key) do update set value = excluded.value;

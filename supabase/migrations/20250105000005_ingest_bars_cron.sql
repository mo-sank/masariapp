-- Market data and paper trading migration: resumable-backfill progress table
-- for ingest-bars, and the nightly schedule via pg_cron + pg_net.
-- Source of truth: docs/db-and-api-reference.md sections 5.5 and 7,
-- requirements 3.1 and 3.2.
--
-- ingest-bars has two modes (see supabase/functions/ingest-bars):
--   * nightly  — append the latest daily bar for every active instrument
--                (requirement 3.2). Scheduled here, weeknights at 22:00 UTC.
--   * backfill — load up to N years of history (requirement 3.1). Run manually
--                once per project by POSTing {"mode":"backfill","years":5}. The
--                backfill is RESUMABLE: it records each finished symbol in the
--                ingest_bars_progress table below, so re-POSTing the same body
--                after an interruption continues instead of refetching symbols
--                it already loaded.
--
-- The nightly schedule reuses the SAME Vault secrets seeded by the ingest-quotes
-- migration (cron_secret, project_url); this migration runs after that one, so
-- they already exist.

-- Resume ledger for backfill. One row per (backfill window, symbol) that has
-- finished loading. `window_key` is the function's "<from>_<to>" ISO-date range,
-- so a backfill with a different horizon is a distinct cohort and will not be
-- skipped by a prior run's progress. Written only by the service role from the
-- Edge Function; never read or written by the app.
create table public.ingest_bars_progress (
  window_key text not null,
  symbol text not null references public.instruments(symbol),
  bars_written int not null default 0,
  completed_at timestamptz not null default now(),
  primary key (window_key, symbol)
);

-- Internal table: no app access. Enable RLS with no policies so anon and
-- authenticated are denied by default; the service-role client used by the Edge
-- Function bypasses RLS. Also revoke table privileges from the Data API roles.
alter table public.ingest_bars_progress enable row level security;
revoke all on public.ingest_bars_progress from anon, authenticated;

-- pg_cron / pg_net are already enabled by the ingest-quotes cron migration; the
-- create-if-not-exists here keeps this migration independently runnable.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Replace any prior definition so this migration is safe to re-run.
select cron.unschedule('ingest-bars')
where exists (select 1 from cron.job where jobname = 'ingest-bars');

-- Nightly at 22:00 UTC on weeknights (after the US session closes in both DST
-- states; the function's own date range decides which bars to append). pg_net
-- reads the shared secret and project URL from Vault at request-build time.
select cron.schedule(
  'ingest-bars',
  '0 22 * * 1-5',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/ingest-bars',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"mode":"nightly"}'::jsonb
  );
  $cron$
);

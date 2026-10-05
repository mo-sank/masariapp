-- Market data and paper trading migration: schedule the ingest-quotes Edge
-- Function with pg_cron + pg_net.
-- Source of truth: docs/db-and-api-reference.md section 5.5, requirement 2.1.
--
-- Every 5 minutes on weekdays, pg_cron POSTs to the ingest-quotes function via
-- pg_net, passing the shared cron secret in the `x-cron-secret` header. The
-- function authenticates on that header (verify_jwt = false in config.toml) and
-- then checks market hours itself, so this schedule can fire slightly outside
-- market hours harmlessly — the function skips without calling the provider.
--
-- The cron window `*/5 13-21 * * 1-5` is UTC (pg_cron uses the server's UTC
-- clock). 13:00-21:59 UTC covers 09:00-17:59 ET during US Eastern Daylight Time
-- and 08:00-16:59 ET during Standard Time, which brackets the 09:30-16:00 ET
-- session plus the 25-minute closing window across both DST states. The
-- function's own market_is_open() check is the source of truth for whether a
-- given firing does any work.
--
-- Two values differ per environment and must NOT be committed, so they live in
-- Supabase Vault and are read at the moment pg_net builds the request:
--   * cron_secret  — the shared secret the function compares against CRON_SECRET.
--   * project_url  — the function base, e.g. https://<ref>.supabase.co/functions/v1
-- A deployer seeds them once per project (see the DO block guard below and the
-- runbook in supabase/functions/ingest-quotes/README.md).

-- pg_cron and pg_net are managed extensions. On Supabase they are enabled from
-- the dashboard; create them here too so a local `supabase db reset` schedules
-- the job as well. Both live in their own schemas by Supabase convention.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Seed placeholder Vault secrets ONLY if absent, so a fresh/local project has
-- rows to read and `supabase db reset` does not fail. A deployer overwrites the
-- real values per environment with:
--   select vault.update_secret(id, '<value>') from vault.secrets where name = '...';
-- or by deleting the placeholder and calling vault.create_secret(...).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret('replace-me-cron-secret', 'cron_secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(
      'http://host.docker.internal:54321/functions/v1', 'project_url');
  end if;
end $$;

-- Replace any prior definition so this migration is safe to re-run against a
-- database that already has the job (pg_cron errors on a duplicate job name).
select cron.unschedule('ingest-quotes')
where exists (select 1 from cron.job where jobname = 'ingest-quotes');

select cron.schedule(
  'ingest-quotes',
  '*/5 13-21 * * 1-5',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/ingest-quotes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

# ingest-quotes

Scheduled Edge Function that refreshes delayed quotes for every active
instrument (requirements 2.1-2.4, 2.6; `docs/db-and-api-reference.md` §7).

`pg_cron` POSTs to `/functions/v1/ingest-quotes` every 5 minutes on weekdays
(via `pg_net`), passing the shared secret in the `x-cron-secret` header. The
function:

1. Rejects the request with `401` unless `x-cron-secret` matches the
   `CRON_SECRET` Edge Function secret (the caller is cron, not a signed-in user,
   so `verify_jwt = false` in `config.toml` and the function authenticates on
   this header itself — requirement 2.4).
2. Skips with `200 {skipped:true}` unless the market is open now **or** was open
   within the last 25 minutes. On a skip the market-data provider is never
   called (requirement 2.2). The 25-minute window lets a run fired just after
   the 16:00 ET close capture the final print (requirement 2.1).
3. Lists active instruments, fetches batch snapshots through the configured
   `QuoteProvider` (`getProvider()`), converts dollars to integer cents exactly
   once at the boundary, and upserts into `public.quotes` (requirement 2.1).
   Each row records `as_of`, `is_delayed = true`, and `source` (requirement
   2.6).
4. Keeps the last-known-good row for any symbol the provider omits or returns a
   non-positive price for, logs the shortfall, and never writes a zero or null
   price (requirement 2.3). If the whole provider call fails, nothing is written.

## Layout

- `ingest.ts` — pure core (`runIngest`, `toQuoteRow`). All I/O is injected via
  `IngestDeps`, so it is unit-tested with fakes (no live stack).
- `index.ts` — HTTP wrapper: cron-secret check, service-role Supabase client,
  `getProvider()`, and the `public.market_is_open()` / `instruments` /
  `quotes` calls.

## Required secrets

Set as Edge Function secrets for the dev and prod projects
(`supabase secrets set --env-file ...`):

- `CRON_SECRET` — shared secret compared against the `x-cron-secret` header.
  Use the same random value stored in Vault as `cron_secret` (below).
- `PROVIDER` — provider id (defaults to `finnhub`).
- `MARKET_DATA_API_KEY` — API key for the chosen provider.

`SUPABASE_URL` and the service-role key are injected automatically by the
platform.

## Scheduling (pg_cron + pg_net + Vault)

The schedule is created by migration
`20250105000004_ingest_quotes_cron.sql`. It enables `pg_cron`/`pg_net`, seeds
placeholder Vault secrets if absent, and registers the `ingest-quotes` cron job
at `*/5 13-21 * * 1-5` (UTC — brackets the ET session plus the closing window
across both DST states; the function's own `market_is_open()` is the source of
truth for whether a firing does work).

After deploying to a real project, overwrite the placeholder Vault secrets with
the per-environment values (never commit these):

```sql
-- The function base, e.g. https://<project-ref>.supabase.co/functions/v1
select vault.update_secret(id, 'https://<project-ref>.supabase.co/functions/v1')
from vault.secrets where name = 'project_url';

-- The same random string set as the CRON_SECRET Edge Function secret
select vault.update_secret(id, '<random-cron-secret>')
from vault.secrets where name = 'cron_secret';
```

Inspect scheduled runs with `select * from cron.job;` and
`select * from cron.job_run_details order by start_time desc limit 20;`.

## Running the tests

These are Deno tests (the functions run on the Edge/Deno runtime and are
excluded from the app's Jest/tsc/ESLint). From the repo root:

```bash
# Core logic — no npm dependencies, runs fully offline:
deno test --allow-env supabase/functions/ingest-quotes/ingest.test.ts

# Full suite (the HTTP wrapper transitively imports the provider's npm:zod):
deno test --allow-env --node-modules-dir=auto supabase/functions/ingest-quotes/

deno lint supabase/functions/ingest-quotes/
deno check supabase/functions/ingest-quotes/ingest.ts
```

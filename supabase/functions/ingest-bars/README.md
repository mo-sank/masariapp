# ingest-bars

Scheduled + manually-triggered Edge Function that loads daily OHLC price history
into `public.quote_bars` (requirements 3.1, 3.2; `docs/db-and-api-reference.md`
§7). It has two modes:

- **nightly** (`{"mode":"nightly"}`) — appends the latest daily bar(s) for every
  active instrument. `pg_cron` POSTs this weeknights at 22:00 UTC via `pg_net`
  (requirement 3.2). It asks the provider for a short (5-day) lookback and
  upserts on `(symbol, bar_date)`, so a missed night or a long weekend
  self-heals and overlap is idempotent.
- **backfill** (`{"mode":"backfill","years":5}`) — loads up to `years` (default
  5, max 25) of history for every active instrument (requirement 3.1). Run once
  per project by a deployer; see below.

Like `ingest-quotes`, the caller is cron / a deployer script, not a signed-in
user, so there is no Supabase JWT. `verify_jwt = false` in `config.toml` and the
function authenticates on the shared `x-cron-secret` header (value in Vault),
returning `401` on a mismatch (requirement 2.4). Dollars are converted to
integer cents exactly once at the boundary with the `cents.ts` helpers.

## Resumable backfill

A 5-year × ~50-symbol backfill is many paced provider calls and can exceed a
single function invocation's time budget or hit a transient rate limit. The
backfill is therefore **resumable**:

- Each finished symbol is recorded in `public.ingest_bars_progress`, keyed by a
  `window_key` of `"<from>_<to>"` (the ISO date range) plus the symbol.
- On start, the function loads the already-completed set for that window and
  skips those symbols.
- A symbol is marked complete only **after** its bars upsert succeeds, so an
  interruption never records a symbol it did not finish.
- A single symbol's failure is isolated and logged (not fatal); it is left
  unmarked and retried on the next run.

So if a backfill is interrupted, simply **POST the same body again** — it
continues from where it left off. A backfill with a different `years` is a
distinct window and starts fresh.

## Layout

- `ingest.ts` — pure core (`runIngestBars`, `parseRequest`, `toBarRows`). All I/O
  is injected via `IngestBarsDeps`, so it is unit-tested with fakes (no live
  stack).
- `index.ts` — HTTP wrapper: cron-secret check, body parsing, service-role
  Supabase client, `getProvider()`, and the `instruments` / `quote_bars` /
  `ingest_bars_progress` calls.

## Required secrets

Same Edge Function secrets as `ingest-quotes` (set per project):

- `CRON_SECRET` — compared against the `x-cron-secret` header. Same random value
  stored in Vault as `cron_secret`.
- `PROVIDER` — provider id (defaults to `finnhub`).
- `MARKET_DATA_API_KEY` — API key for the chosen provider.

`SUPABASE_URL` and the service-role key are injected by the platform.

## Scheduling (pg_cron + pg_net + Vault)

The nightly schedule and the `ingest_bars_progress` table are created by
migration `20250105000005_ingest_bars_cron.sql`. It reuses the Vault secrets
(`cron_secret`, `project_url`) seeded by the `ingest-quotes` cron migration. The
job `ingest-bars` runs at `0 22 * * 1-5` (UTC) and POSTs `{"mode":"nightly"}`.

Inspect runs with `select * from cron.job;` and
`select * from cron.job_run_details order by start_time desc limit 20;`.

## Running the one-off backfill (requires live project credentials)

The backfill is **not** scheduled; a deployer runs it once per project after the
function is deployed and the provider secrets are set. It calls the live dev/prod
project over the network, so it cannot be executed from an offline/CI sandbox —
run it from a machine with the project's cron secret:

```bash
# Replace <project-ref> and <cron-secret> with the dev project's values.
curl -sS -X POST \
  "https://<project-ref>.supabase.co/functions/v1/ingest-bars" \
  -H "content-type: application/json" \
  -H "x-cron-secret: <cron-secret>" \
  -d '{"mode":"backfill","years":5}'
```

The response JSON reports `requested`, `completed`, `skipped`, `failed`,
`barsWritten`, and per-symbol detail. If any symbols are `failed` (rate limit /
timeout) or the call itself times out, **re-run the exact same command** — the
resume logic skips the symbols already loaded and retries the rest. Repeat until
`failed` is 0 and `skipped == requested` (everything done).

> Note: the backfill against the live dev project was **not** executed in this
> environment because it needs network access and the project's cron secret,
> which are not available here. Run the command above once the function is
> deployed to the dev project.

## Running the tests

Deno tests (the functions run on the Edge/Deno runtime and are excluded from the
app's Jest/tsc/ESLint). From the repo root:

```bash
# Core logic — no npm dependencies, runs fully offline:
deno test --allow-env supabase/functions/ingest-bars/ingest.test.ts

# Full suite (the HTTP wrapper transitively imports the provider's npm:zod):
deno test --allow-env --node-modules-dir=auto supabase/functions/ingest-bars/

deno lint supabase/functions/ingest-bars/
deno check supabase/functions/ingest-bars/ingest.ts
```

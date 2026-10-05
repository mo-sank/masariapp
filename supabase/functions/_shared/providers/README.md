# \_shared/providers — market data provider

Shared code that lets the `ingest-quotes` and `ingest-bars` Edge Functions fetch
delayed quotes and daily bars behind one interface. The app never calls a
provider directly; only these functions do, on a schedule, writing to the
`quotes` and `quote_bars` tables.

## Files

- `types.ts` — the `QuoteProvider` interface plus `ProviderQuote` / `ProviderBar`
  (docs/db-and-api-reference.md §7.1). Provider values are **dollars**.
- `cents.ts` — `dollarsToCents` and friends: the single place dollars become
  integer cents, at the ingest boundary (`Math.round(price * 100)` with
  float-noise correction). Rejects non-finite, negative, and (for prices) zero
  values so bad data never reaches the DB.
- `finnhub.ts` — the default `QuoteProvider`. Validates every response with Zod,
  paces requests under the free-tier limit, and retries rate-limited calls with
  exponential backoff. A missing/zero/malformed symbol is skipped, never written
  as a zero price (requirement 2.3).
- `alpaca.ts` — a **bars-only** `QuoteProvider`. Finnhub's free tier 403s on
  historical candles, so daily bars come from Alpaca's free market-data plan
  (IEX feed, ~15 min delayed) via `GET /v2/stocks/bars`. Validates with Zod,
  paginates `next_page_token`, paces + retries. `getSnapshots` throws — this
  provider is only used for `getDailyBars` (quotes stay on Finnhub).
- `index.ts` — `getProvider()` returns the configured provider, so swapping or
  splitting providers is a config change that touches only this folder
  (requirement 2.5). `PROVIDER` (default `finnhub`) chooses the QUOTES provider;
  the optional `BARS_PROVIDER` chooses a different provider for daily BARS. With
  `PROVIDER=finnhub` + `BARS_PROVIDER=alpaca`, quotes come from Finnhub and bars
  from Alpaca via a small composite; when `BARS_PROVIDER` is unset the single
  provider serves both (backward compatible).
- `__fixtures__/`, `*.test.ts` — recorded-fixture tests. No live network calls.

## Running the tests

These are Deno tests (the functions run on the Edge/Deno runtime and are
excluded from the app's Jest/tsc/ESLint). From the repo root:

```bash
deno test supabase/functions/_shared/providers/
deno lint supabase/functions/_shared/providers/
deno check supabase/functions/_shared/providers/*.ts
```

## Spike: provider choice (task 1)

The design named Massive/Polygon as the default candidate with Alpaca, Finnhub,
and Twelve Data as alternates, pending a spike to confirm a batch/snapshot
endpoint, a free-tier limit that fits ~50 symbols every 5 minutes, and terms that
allow displaying delayed data in a published app.

Findings (verified against each provider's current docs/knowledge base):

| Provider        | Free-tier rate limit | Snapshot/batch on free tier | Fit for ~50 symbols / 5 min |
| --------------- | -------------------- | --------------------------- | --------------------------- |
| Massive/Polygon | 5 requests/min       | No — snapshot & current intraday need a paid Starter plan | No (5/min can't cover 50 symbols in a cycle) |
| **Finnhub**     | **60 calls/min**     | `/quote` is per-symbol (no single batch call), but 50 symbols = 50 calls, under 60/min | **Yes** |

**Decision: Finnhub free tier is the default provider.** It clears the rate-limit
constraint (50 symbols ≈ 50 calls per 5-minute cycle, within 60/min) and offers
delayed US stock quotes plus daily candles. Its `/quote` endpoint is per-symbol
rather than a single batch call, so `getSnapshots` fans out one request per
symbol and paces them — the `QuoteProvider` interface hides this, so a later
switch to a true batch provider changes only `finnhub.ts` and the `getProvider`
switch.

Massive/Polygon's free "Basic" plan is capped at 5 requests/min and gates the
snapshot and current-intraday data behind a paid plan, so it cannot serve the
MVP's refresh cadence for free; it remains a drop-in alternate if a paid tier is
adopted later.

Before launch, re-confirm the chosen provider's **display/redistribution terms**
for a published consumer app and its then-current rate limits — provider terms
change, and the ~15-minute delayed, educational, paper-money framing (persistent
disclaimer, requirement 13.1) must stay within those terms.

## Secrets

All are Edge Function secrets (never shipped in the app); set with
`supabase secrets set` per project.

- `MARKET_DATA_API_KEY` — Finnhub key for QUOTES (`/quote`).
- `PROVIDER` — optional; overrides the default quotes provider (`finnhub`).
- `BARS_PROVIDER` — optional; set to `alpaca` to source daily BARS from Alpaca
  instead of the quotes provider. Needed because Finnhub's free tier 403s on
  historical candles.
- `ALPACA_API_KEY_ID` / `ALPACA_API_SECRET_KEY` — Alpaca market-data creds
  (required when `BARS_PROVIDER=alpaca`). The free plan serves IEX daily bars.

### Why the split (post-launch finding)

The task-1 spike chose Finnhub, but Finnhub later moved historical daily
candles behind a paid plan (the free `/stock/candle` returns 403). Finnhub's
`/quote` still works on the free tier, so quotes stay on Finnhub and only the
bars source moved to Alpaca — a config-level change (`BARS_PROVIDER=alpaca`)
with no edits to the ingest functions or the app, exactly what the
`QuoteProvider` abstraction was designed to allow (requirement 2.5).

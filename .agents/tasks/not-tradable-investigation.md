# Investigation: "This company isn't available to trade right now"

**Scope:** read-only. No code changed, nothing deployed, no DB state altered.
**App → DB:** the Expo app talks to the REMOTE Supabase project `fmjnijwyzkzpksweemkj` (`.env` `EXPO_PUBLIC_SUPABASE_URL`), which is the same project the local CLI is linked to (`supabase/.temp/project-ref` = `fmjnijwyzkzpksweemkj`). Auth is Auth0; the Auth0 ID token is sent to Supabase and RLS derives the user via `public.current_user_id()`.

---

## 1. Summary answer (most likely root cause)

The user-facing string **"That company isn't available to trade right now."** comes from one place: the friendly error map in `src/features/trading/use-place-order.ts:91`, keyed `symbol_not_available`. That code is raised by the server RPC `place_market_order` only when the instrument row is missing or `is_active = false` (or a non-starter symbol without the `full_universe` unlock).

Because the failure reproduces for **every** symbol, the single condition that explains all of buy / sell / Stress Lab breaking at once is a **remote database that is missing data or schema the local repo assumes**. In priority order:

1. **The `instruments` table is empty (or not `is_active`) on the remote.** Instruments are NOT seeded by `supabase db reset` — `supabase/seed/seed.sql` seeds `app_config` only and its own comment says "instruments.csv / holidays.csv are seeded by later tasks." The instrument seed lives in a separate file (`supabase/seed/instruments.sql`) that must be run by hand against the remote. If it never ran, every symbol fails the `where symbol = p_symbol and is_active` lookup and the RPC raises exactly `symbol_not_available` → the reported message. This is the single best match for the exact wording.
2. **The `quotes` table is empty (ingest-quotes never ran on the remote).** If instruments exist but there are no quote rows, the RPC raises `no_quote` → "We don't have a price for this company yet. Try again later." (slightly different wording, but same "can't trade anything" symptom). The ingest-quotes Edge Function needs secrets set and Vault values overwritten on the remote; by default they are placeholders.
3. **The Stress Lab migrations are not deployed to the remote.** The 4 Stress Lab commits (`febca79`, `66bbdc1`, `5ff6a2e`, `e5cbcfb`) are on local `main` but ahead of `origin/main` (`ab1a578`). If `main` was pushed/deployed but the migrations were not applied to the remote DB, the Stress Lab RPCs/tables don't exist and "entering the Stress Lab" errors. This is a *separate* failure from the trade error, not its cause.

The quickest confirmation is the migration-list diff plus three SELECTs in §5.

---

## 2. Exact message source (file:line + condition)

`src/features/trading/use-place-order.ts`, the `PLACE_ORDER_ERROR_MESSAGES` map:

```
line 89  quote_stale: 'Prices are catching up. Try again in a moment.',
line 90  no_quote: "We don't have a price for this company yet. Try again later.",
line 91  symbol_not_available: "That company isn't available to trade right now.",
```

The code is the raw Postgres exception message surfaced by PostgREST. `mapPlaceOrderError(error)` (same file) reads `error.message`, trims it, and looks it up; anything unknown falls back to "We couldn't place your order. Please try again."

A near-identical string exists in the watchlist map (`src/features/watchlist/use-watchlist-mutations.ts:58`, "…available to follow right now.") — that is the *follow* path, not the *trade* path, so it is not the trade-ticket message.

---

## 3. Full UI → hook → RPC trace

**UI:** `src/features/trading/components/order-ticket.tsx`
- `useQuote(symbol)` (`src/features/explore/use-quotes.ts`) reads the `quotes` row; `fetchQuote` returns `null` when no row exists rather than throwing. So with no quote, the ticket still renders, the estimate shows `$0.00`, and the Buy button is **not** disabled (`canSubmitOrder` in `order-ticket-logic.ts` checks qty/pending/rationale only — never price). The user can press Buy and only then hit the server guard.
- `onSubmit` calls `placeOrder.mutate({ symbol, side, qty, idempotencyKey, rationaleTags, rationaleText })`; `onError` sets `errorText = mapPlaceOrderError(error)` and keeps the ticket open (the red alert box).

**Hook:** `src/features/trading/use-place-order.ts`
- `placeOrder()` calls `supabase.rpc('place_market_order', { p_symbol, p_side, p_qty, p_idempotency_key, p_rationale_tags, p_rationale_text })`. No price is sent (server is authoritative). On error it throws the raw Supabase error; `mapPlaceOrderError` turns the message code into copy.

**RPC:** `supabase/migrations/20250105000006_place_market_order_rpc.sql` (`public.place_market_order`, SECURITY DEFINER). Guard order and the code each raises:
1. `current_user_id()` null → `not_authenticated`
2. no `paper_accounts` row for user → `no_account`
3. idempotency replay → returns original order
4. shape invalid (side/qty/key) → `invalid_order`
5. no matching `user_unlocks` row for `market_buy`/`market_sell` → `feature_locked`
6. **`select * into v_inst from instruments where symbol = p_symbol and is_active; if not found then raise exception 'symbol_not_available';`** ← the reported message
7. non-starter instrument without `full_universe` unlock → `symbol_not_available`
8. **`select * into v_q from quotes where symbol = p_symbol; if not found then raise 'no_quote';`**
9. market open AND `quotes.updated_at < now() - quote_stale_minutes` → `quote_stale`
10. buy: `insufficient_cash` / `position_cap_exceeded`; sell: `insufficient_shares`

So "not available to trade" is specifically step 6/7 (instrument missing or inactive, or non-starter locked). "No price" is step 8. Both are global if the whole table is empty.

**Market session is NOT the cause of this message.** `market_is_open()` (migration `...0001_market_data.sql`) and `market_session()` (`...0009_market_session.sql`) only gate the *stale-quote* check (step 9) and the `delayed_quote` vs `last_close` label. A closed market does **not** block an order — `place_market_order` fills at last close when closed. The client banner (`use-market-status.ts`) is display-only. So "market closed" cannot produce "not available to trade".

---

## 4. Ranked root causes with evidence

### (a) ★ Instruments not seeded / inactive on the remote → `symbol_not_available`
- **Supports:** exact wording match (step 6/7). Fails for *every* symbol, which matches an empty/inactive `instruments` table. `supabase/seed/seed.sql` seeds only `app_config`; its comment explicitly defers instruments to "later tasks," and `supabase/seed/instruments.sql` is a standalone idempotent file ("safe to … apply to a linked project after migrations") that is NOT part of `db reset`'s auto-seed. On a remote project, `db push` applies migrations but does not run seed files, so instruments can easily be absent.
- **Refutes:** if the Explore list and stock-detail screens show company names/prices normally, instruments ARE present — then drop to (b).
- **Fix:** apply the instrument seed to the remote: `psql "$DB_URL" -f supabase/seed/instruments.sql` (idempotent), or run it in the Supabase SQL editor. Also apply `supabase/seed/holidays.sql` for the calendar. No `db reset`/`db push` needed for data.

### (b) ★ Quotes table empty / stale (ingest-quotes not running on remote) → `no_quote` (or `quote_stale`)
- **Supports:** `quotes` is populated only by the `ingest-quotes` Edge Function, POSTed by `pg_cron`+`pg_net` (`...0004_ingest_quotes_cron.sql`). That migration seeds **placeholder** Vault secrets (`cron_secret` = `replace-me-cron-secret`, `project_url` = a localhost docker URL) and says a deployer must overwrite them per environment. The function also needs Edge secrets `CRON_SECRET`, `PROVIDER`, `MARKET_DATA_API_KEY` set (functions/ingest-quotes/README.md). If the function isn't deployed, the secrets/Vault values aren't set, or the API key is missing, no quotes are ever written → `no_quote` for every symbol. `fetchQuote` returning `null` also makes the ticket show `$0.00` with the Buy button still enabled, consistent with "press buy, get an error."
- **Refutes:** if quotes exist and are fresh, the error would not be `no_quote`/`quote_stale`.
- **Fix:** deploy the function (`npx supabase functions deploy ingest-quotes`), set Edge secrets (`npx supabase secrets set CRON_SECRET=… PROVIDER=finnhub MARKET_DATA_API_KEY=…`), and overwrite the Vault placeholders (`vault.update_secret` for `cron_secret` and `project_url` as in the README). Confirm with `cron.job_run_details`.

### (c) Instruments marked inactive (subset of (a))
- **Supports:** step 6 also fires when `is_active = false`. If a data load set `is_active` wrong, all symbols fail.
- **Refutes:** the seed sets `is_active = true` for all rows, so this needs a deliberate/bad update to occur.
- **Fix:** `update public.instruments set is_active = true where …;` after confirming with the SELECT in §5.

### (d) Remote DB missing migrations (schema drift) — mainly explains the Stress Lab error
- **Supports:** local `main` is 4 commits ahead of `origin/main`; all four are Stress Lab (`febca79`/`66bbdc1`/`5ff6a2e`/`e5cbcfb`). Migrations `20250108000001..03` add the Stress Lab tables/RPCs. If they aren't applied to the remote, `useScenarios` (`stress_scenarios`) and `record_simulation`/`save_*` 404 or error → "entering the Stress Lab" fails. If the *entire* `20250105*` trading set were also missing, `place_market_order` itself would 404 (PostgREST "function not found"), which `mapPlaceOrderError` would render as the generic fallback, not "not available to trade" — so a *fully* missing trading RPC is unlikely given the user sees the specific message. Most consistent: trading schema present, instruments/quotes data absent (a/b); Stress Lab schema possibly absent (its own bug).
- **Refutes (for the trade message):** the user gets the *specific* `symbol_not_available` copy, which requires the RPC to exist and run.
- **Fix:** `npx supabase migration list --linked` to see the gap, then `npx supabase db push` to apply pending migrations to the remote. (Do this only after reviewing the list.)

### (e) Auth/token issue making `current_user_id()` null
- **Supports:** would raise `not_authenticated` ("Sign in to place an order.").
- **Refutes:** that is different copy from the reported message, and the user is clearly signed in (they reach the ticket and the Stress Lab). Low likelihood.
- **Fix:** none needed unless the message seen is actually "Sign in to place an order."

---

## 5. Safe, read-only verification commands

All of the following are read-only. **Do NOT run `supabase db push` or `db reset`** until after you've read the migration-list output and decided.

### Compare local vs remote migrations (schema drift, hypothesis d)
```bash
cd /Users/mohamednazirsankari/Apps/masariapp
npx supabase migration list --linked
```
Expected if healthy: every local `2025010*` and `20250108*` migration shows in both Local and Remote columns. A migration present locally but blank remotely is unapplied on the remote.

### Confirm which friendly message the user actually sees
Ask the user to read the exact words. "…available to trade right now." ⇒ `symbol_not_available` (hypotheses a/c). "We don't have a price for this company yet." ⇒ `no_quote` (b). "Prices are catching up." ⇒ `quote_stale` (b). "Sign in to place an order." ⇒ auth (e).

### DB SELECTs (run in the Supabase SQL editor for project `fmjnijwyzkzpksweemkj`, or `psql` with the pooler URL in `supabase/.temp/pooler-url`). All are SELECTs — no writes.

Instruments present and active (hypotheses a, c):
```sql
select count(*) as total,
       count(*) filter (where is_active) as active,
       count(*) filter (where is_starter) as starters
from public.instruments;
-- Expect ~50 total, all active, 8 starters. 0 total ⇒ root cause (a).
select symbol, is_active, is_starter from public.instruments where symbol = 'AAPL';
-- No row, or is_active=false ⇒ explains symbol_not_available for AAPL.
```

Quotes present and fresh (hypothesis b):
```sql
select count(*) as quote_rows, max(updated_at) as newest, max(as_of) as newest_as_of
from public.quotes;
-- 0 rows ⇒ no_quote for every symbol (cause b). A stale max(updated_at)
-- (older than quote_stale_minutes, default 30) ⇒ quote_stale while market open.
```

Market session right now (rules out "market closed" as the cause, and it never is for this message):
```sql
select public.market_session() as session, public.market_is_open() as regular_open;
-- Informational only; a 'closed' session does NOT block orders.
```

Config the RPC reads:
```sql
select key, value from public.app_config
where key in ('quote_stale_minutes','starter_position_cap_cents','starter_cash_cents');
```

ingest-quotes cron + Vault wiring (hypothesis b, if you have access):
```sql
select jobname, schedule, active from cron.job where jobname = 'ingest-quotes';
select start_time, status, return_message
from cron.job_run_details order by start_time desc limit 10;
select name from vault.secrets where name in ('cron_secret','project_url');
-- Then confirm the decrypted project_url is the real https://fmjnijwyzkzpksweemkj.supabase.co/...
-- and cron_secret is NOT 'replace-me-cron-secret' (placeholder ⇒ function 401s, no quotes).
```

Stress Lab schema present (hypothesis d — the Stress Lab error specifically):
```sql
select to_regclass('public.stress_scenarios') as scenarios_table;
select count(*) from public.stress_scenarios;   -- errors/null if migrations not applied
select proname from pg_proc where proname in
  ('record_simulation','save_prediction','save_reflection','upsert_challenge_progress');
```

### Corresponding fixes (apply only after confirming)
- **(a) instruments empty/inactive:** run `supabase/seed/instruments.sql` (and `holidays.sql`) against the remote; or `update … set is_active = true` if rows exist but inactive.
- **(b) quotes empty/stale:** deploy `ingest-quotes`, set Edge secrets, overwrite Vault `cron_secret`/`project_url`; verify a successful `cron.job_run_details` row and non-empty `quotes`.
- **(d) missing migrations:** `npx supabase db push` after reviewing `migration list --linked`.
- **(e) auth:** only if the real message is the auth one; re-check the Auth0 ID-token flow in `src/lib/supabase.ts` / `src/lib/auth0.ts`.

---

## Note on the separate iOS warning

The console line `[com.apple.UIKit] -[UIApplication statusBarStyle] … deprecated … no-op on 27.0` is unrelated to the trade error. It is a deprecation warning from UIKit about the status-bar style API on newer iOS and does not affect trading. Out of scope for this investigation; worth a separate look at the status-bar/`expo-status-bar` config if it needs silencing.

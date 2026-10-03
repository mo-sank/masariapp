```
# Design Document: Market Data and Paper Trading
```

```
## Overview
Edge Functions fetch delayed quotes and daily bars from one market data provider on a schedule and write them to Postgres. The app reads those tables. All trading is done by the place_market_order RPC (single transaction, row-locked, idempotent). The app renders data and requests actions; it never decides prices, fills, or balances.
```

```
## Architecture
Provider -> ingest-quotes / ingest-bars (Edge Functions, cron) -> quotes, quote_bars (Postgres) -> app reads via Supabase client (TanStack Query, refetch every 60 s on price screens) -> order ticket -> rpc place_market_order -> orders, positions, paper_accounts -> app invalidates portfolio queries.
```

```
## Server components
### supabase/functions/_shared/providers
- types.ts: QuoteProvider, ProviderQuote, ProviderBar (see DB reference 7.1).
- <provider>.ts: default implementation (candidate: Massive/Polygon free tier; alternates Alpaca, Finnhub, Twelve Data). Maps provider JSON through Zod, converts dollars to integer cents once, handles rate limits with backoff.
- index.ts: getProvider() reads a PROVIDER env var so swapping needs no code changes elsewhere.
```

```
### ingest-quotes
1. Check x-cron-secret (401 if wrong). 2. Call market_is_open(now) or market_is_open(now - 25 min); else return 200 {skipped:true}. 3. Select active symbols. 4. provider.getSnapshots(symbols) in batches that respect the rate limit. 5. Validate (price > 0) and upsert quotes with as_of, source, updated_at. 6. Return counts; log failures; never overwrite with bad data.
```

```
### ingest-bars
Modes: backfill (years param; per-symbol, rate-limit aware, resumable) and nightly (append last session). Upsert into quote_bars on (symbol, bar_date).
```

```
### Postgres
Tables: instruments, quotes, quote_bars, market_holidays, paper_accounts, positions, orders, trade_reflections, watchlist_items, portfolio_snapshots. Functions: market_is_open, place_market_order, submit_reflection, watchlist_add/remove, snapshot_portfolios (SQL in DB reference sections 3.3, 3.4, 5.2, 5.4, 5.5).
```

```
## Client components (src/features/trading and src/features/explore)
- lib/money.ts: formatCents, parseDollarsToCents (rejects floats beyond 2 decimals), pctChange(basis points), all unit tested.
- api: useInstruments(), useQuotes(), useBars(symbol, range), usePortfolio(), useOrders(), usePlaceOrder() (generates UUID idempotency key per ticket session, reuses on retry), useWatchlist(), useReflection(), useMarketStatus().
- Screens: Explore list + search; stock/[symbol] detail (price header, chart, stats, watchlist button, Trade button); trade/[symbol] ticket modal; Portfolio tab; Trade history; reflection prompt sheet.
- Components: PriceChange, DelayedBadge, MarketBanner, Disclaimer, LineChart (react-native-svg based), RationaleChips, OrderConfirmation.
- GuidedTradeStep (for lesson L1.4): wraps the ticket with the starter list only, rationale required, and a celebratory confirmation.
```

```
## Order ticket flow
1. Pick quantity (stepper) -> show estimated cost = qty x displayed price (labelled "estimate; fills at the latest price").
2. If trade.rationale unlocked and side = buy -> choose at least one rationale chip (e.g. "I know the brand", "Growing company", "Learning from a lesson", "Just exploring") plus optional note.
3. Confirm -> rpc with idempotency key. Disable the button while pending.
4. Success -> confirmation (fill price, qty, total, source). If sell and trade.reflection unlocked -> reflection sheet.
5. Failure -> map error code to friendly copy; keep the ticket open; retry with the same key only for network errors.
```

```
## Ledger invariants (asserted in pgTAP and unit tests)
cash >= 0; qty > 0; delete position at 0; cash = starting cash - sum(buy totals) + sum(sell totals); cash + sum(position cost basis) = starting cash + sum(realized P&L); realized P&L = sell total - proportional cost basis; replaying orders in order reproduces positions and cash.
```

```
## Error handling
Provider timeout/429: exponential backoff, keep last-known-good, alert via Sentry (server side). Stale quotes: server rejects (quote_stale) and the UI shows "Prices are catching up, try again in a moment". Offline: show cached data with a banner; order button disabled.
```

```
## Testing strategy
- Unit: money helpers, P&L math, chart range slicing, rationale validation, error-code mapping.
- Provider tests with recorded fixtures (no live calls in CI): cents conversion, missing fields, rate-limit handling.
- pgTAP: place_market_order (locked feature, insufficient cash, cap, idempotency, concurrent orders using two sessions if feasible, sell basis math including partial sells and full close, rounding), watchlist limit, reflection ownership, snapshot idempotency, market_is_open for weekday, weekend, holiday, early close.
- Component: ticket, portfolio rows, empty/locked states, disclaimer present on every price screen.
- Manual: place buy then sell on a device; verify cash, positions, history, reflection; verify market-closed labeling after hours.
```
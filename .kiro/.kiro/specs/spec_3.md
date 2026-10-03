Masari Spec 3: Market Data and Paper Trading

_Folder in repo: .kiro/specs/market-data-paper-trading/. Build this after Spec 1. It can run in parallel with Spec 2 once the database baseline exists, but the guided first trade in lesson L1.4 needs both._

# What this spec delivers

The Robinhood half of Masari: a ~50-stock universe, delayed quotes ingested on a schedule, Explore and search, stock detail with charts, a watchlist, a paper account and portfolio, server-authoritative market buy and sell, pre-trade rationale and post-trade reflection, trade history, and daily portfolio snapshots.

**Outside Kiro first:** choose the market data provider and get an API key (one-hour spike described in the DB reference, section 7.1).

# File: .kiro/specs/market-data-paper-trading/requirements.md

```
# Requirements Document: Market Data and Paper Trading
```

```
## Introduction
This spec builds the instrument universe, scheduled delayed-quote ingestion, price history, Explore and stock detail screens, watchlist, paper account and portfolio, and server-authoritative market orders with rationale and reflection. It depends on spec foundation-auth-data and follows .kiro/steering/*.md (especially trading-and-data-rules.md) and docs/db-and-api-reference.md.
```

```
## Requirements
```

```
### Requirement 1: Instrument universe
**User Story:** As the team, I want a curated, teen-appropriate universe, so that learners see familiar, safe examples.
```

```
#### Acceptance Criteria
1. WHEN seed data is loaded THEN the instruments table SHALL contain about 50 large US companies across all sectors, with 8 marked is_starter.
2. WHEN the universe is reviewed THEN it SHALL exclude penny stocks, meme stocks, leveraged or inverse products, and crypto-related products.
3. WHEN an instrument is shown THEN the system SHALL use neutral wording and SHALL NOT present any security as a recommendation.
```

```
### Requirement 2: Delayed quote ingestion
**User Story:** As a learner, I want reasonably fresh prices, so that trading feels real.
```

```
#### Acceptance Criteria
1. WHEN the schedule fires during market hours (or within 25 minutes after close) THEN the ingest-quotes function SHALL fetch batch snapshots for all active instruments from the QuoteProvider and upsert quotes in integer cents.
2. WHEN the market is closed and the closing window has passed THEN the function SHALL exit without calling the provider.
3. WHEN the provider call fails or returns partial data THEN the function SHALL keep the last-known-good rows, log the failure, and SHALL NOT write zero or null prices.
4. WHEN the function is called without the correct x-cron-secret THEN it SHALL return 401.
5. WHEN the provider is swapped THEN only the provider implementation SHALL change (QuoteProvider interface).
6. WHEN quotes are written THEN each row SHALL record as_of, is_delayed, and source.
```

```
### Requirement 3: Price history for charts
**User Story:** As a learner, I want to see how a stock moved over time.
```

```
#### Acceptance Criteria
1. WHEN ingest-bars runs in backfill mode THEN it SHALL load up to 5 years of daily bars for each active instrument into quote_bars.
2. WHEN the nightly job runs THEN it SHALL append the latest daily bar.
3. WHEN a chart requests a range THEN the app SHALL read bars from quote_bars (ranges 1M, 3M, 1Y, 5Y; no intraday in the MVP).
```

```
### Requirement 4: Explore and search
**User Story:** As a learner, I want to browse and search companies, so that I can find ones I know.
```

```
#### Acceptance Criteria
1. WHEN the user has the explore feature unlocked THEN the Explore tab SHALL list instruments with name, symbol, price, and day change, with the starter stocks highlighted.
2. WHEN the user types in search THEN the system SHALL filter by symbol or name.
3. WHEN explore is locked THEN the tab SHALL show the locked state naming the lesson that unlocks it.
4. WHEN prices are shown THEN a "Delayed ~15 min" label SHALL be visible on the screen.
```

```
### Requirement 5: Stock detail
**User Story:** As a learner, I want a simple page for each company, so that I can read the basics before trading.
```

```
#### Acceptance Criteria
1. WHEN the user has stock_detail unlocked THEN tapping an instrument SHALL open a page with price, day change in dollars and percent, previous close, day range, volume, and sector.
2. WHEN the user has chart.ranges unlocked THEN the chart SHALL offer 1M, 3M, 1Y, and 5Y; otherwise it SHALL show a fixed 1M chart and a locked hint.
3. WHEN the user has chart.trade_markers unlocked THEN the chart SHALL mark the user's own buys and sells.
4. WHEN the page renders THEN it SHALL show the paper-money and not-advice disclaimer.
```

```
### Requirement 6: Watchlist
**User Story:** As a learner, I want to follow a few companies, so that I can keep an eye on them.
```

```
#### Acceptance Criteria
1. WHEN watchlist is unlocked THEN the user SHALL be able to add and remove stocks from stock detail and see them in a Watchlist section.
2. WHEN the user tries to add more than watchlist_max (5) THEN the system SHALL show a friendly limit message.
3. WHEN watchlist is locked THEN the add button SHALL show the lock hint.
```

```
### Requirement 7: Paper account and portfolio
**User Story:** As a learner, I want to see my paper cash, holdings, and profit or loss.
```

```
#### Acceptance Criteria
1. WHEN the user has the portfolio feature unlocked THEN the Portfolio tab SHALL show cash, positions value, total equity, and total gain or loss versus starting cash.
2. WHEN positions exist THEN each row SHALL show symbol, shares, average cost, current price, value, and unrealized gain or loss in dollars and percent, computed from integer cents.
3. WHEN there are no positions THEN the screen SHALL show a friendly empty state with a link to Explore.
4. WHEN portfolio values are shown THEN they SHALL be labeled "Paper money".
```

```
### Requirement 8: Market orders (server authoritative)
**User Story:** As a learner, I want to buy and sell paper shares, so that I can apply what I learned.
```

```
#### Acceptance Criteria
1. WHEN the user places an order THEN the app SHALL call place_market_order with symbol, side, quantity, and a client-generated UUID idempotency key, and SHALL NOT send a price.
2. WHEN a buy is placed THEN the system SHALL require trade.market_buy, an eligible instrument, enough cash, and a resulting position within the starter cap (unless trade.raise_cap).
3. WHEN a sell is placed THEN the system SHALL require trade.market_sell and enough shares, and SHALL compute realized P&L from proportional cost basis.
4. WHEN an order succeeds THEN cash, positions, and the orders row SHALL change in one transaction and the app SHALL show a confirmation with fill price, quantity, total, and price source.
5. WHEN the same idempotency key is sent again THEN the system SHALL return the original order and SHALL NOT change balances twice.
6. WHEN the market is closed THEN the ticket SHALL say the order fills at the last close, and price_source SHALL be 'last_close'.
7. WHEN the server returns an error code THEN the app SHALL show friendly text for it (feature_locked, insufficient_cash, insufficient_shares, position_cap_exceeded, quote_stale, no_quote, symbol_not_available).
8. WHEN two orders for the same user arrive at the same time THEN the system SHALL process them one after the other with no negative cash and no negative shares.
```

```
### Requirement 9: Rationale and reflection
**User Story:** As a learner, I want to state why I trade and reflect afterwards, so that I learn from decisions instead of chasing outcomes.
```

```
#### Acceptance Criteria
1. WHEN trade.rationale is unlocked and the user places a buy THEN the ticket SHALL require at least one reason chip and allow an optional note up to 280 characters.
2. WHEN trade.reflection is unlocked and a sell completes THEN the app SHALL prompt "Did it go better, as expected, or worse?" with an optional note, calling submit_reflection.
3. WHEN rationale or reflection text is stored THEN it SHALL be private to the user and never shown to others.
```

```
### Requirement 10: Trade history
**User Story:** As a learner, I want to review my past trades and my reasons.
```

```
#### Acceptance Criteria
1. WHEN trade.history is unlocked THEN the user SHALL see a list of orders newest first with side, symbol, quantity, price, total, realized P&L for sells, rationale tags, and reflection.
```

```
### Requirement 11: Market status
**User Story:** As a learner, I want to know whether the market is open, so that prices make sense.
```

```
#### Acceptance Criteria
1. WHEN any price screen is shown THEN a banner SHALL indicate Open, Closed (after hours), or Closed (holiday) using market_is_open and market_holidays.
2. WHEN the market is closed THEN prices SHALL be labeled as the last close.
```

```
### Requirement 12: Portfolio snapshots
**User Story:** As the team, I want daily equity snapshots, so that charts and benchmark comparisons are possible later.
```

```
#### Acceptance Criteria
1. WHEN the snapshot job runs after close THEN a portfolio_snapshots row SHALL exist per account per day with cash, positions value, and equity.
2. WHEN the job runs twice in one day THEN the row SHALL be updated, not duplicated.
```

```
### Requirement 13: Safety and legal copy
**User Story:** As a parent or reviewer, I want clear disclaimers, so that the app is not mistaken for advice or real trading.
```

```
#### Acceptance Criteria
1. WHEN price or trade screens render THEN they SHALL show "Paper money. Educational only. Not financial advice." in a persistent footer or banner.
2. WHEN the app describes a company THEN it SHALL NOT use language that recommends buying or selling it.
```

# File: .kiro/specs/market-data-paper-trading/design.md

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

# File: .kiro/specs/market-data-paper-trading/tasks.md

```
# Implementation Plan: Market Data and Paper Trading
```

```
- [ ] 1. Market data provider spike and shared provider code
  - Confirm the chosen provider has a batch/snapshot endpoint, a free-tier rate limit that fits ~50 symbols every 5 minutes, and terms that allow displaying delayed data in a published app
  - Implement QuoteProvider types, the provider implementation, Zod mapping, cents conversion, and recorded-fixture tests
  - _Requirements: 2.5, 2.6_
```

```
- [ ] 2. Database for market data and trading
  - Migrations for instruments, quotes, quote_bars, market_holidays, paper_accounts (if not present), positions, orders, trade_reflections, watchlist_items, portfolio_snapshots with RLS (DB reference 3.3, 3.4, 4)
  - Seed instruments.csv (about 50, 8 starters; exclusions per security-privacy.md) and market_holidays from the official NYSE calendar
  - _Requirements: 1.1, 1.2_
```

```
- [ ] 3. Market hours function and tests
  - Add market_is_open; pgTAP tests for weekday, weekend, holiday, early close, and ET boundaries around daylight saving changes
  - _Requirements: 11.1_
```

```
- [ ] 4. ingest-quotes Edge Function
  - Implement with cron-secret check, market-hours skip (including the 25-minute closing window), batching, validation, upsert, and last-known-good behavior; verify_jwt = false in config.toml
  - Schedule with pg_cron + pg_net; store cron_secret in Vault
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
```

```
- [ ] 5. ingest-bars Edge Function
  - Backfill (5 years, resumable) and nightly modes; run the backfill once on the dev project; schedule nightly
  - _Requirements: 3.1, 3.2_
```

```
- [ ] 6. place_market_order RPC
  - Implement DB reference 5.2 as a migration with grants; add error codes
  - pgTAP tests: locked feature, cash, cap, idempotency, partial and full sells, realized P&L rounding, concurrency, invariants
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_
```

```
- [ ] 7. Supporting RPCs and snapshot job
  - submit_reflection, watchlist_add/remove (limit), snapshot_portfolios + schedule; pgTAP tests
  - _Requirements: 6.2, 9.2, 12.1, 12.2_
```

```
- [ ] 8. Client money and data layer
  - lib/money.ts with tests; TanStack Query hooks for instruments, quotes, bars, portfolio, orders, watchlist, market status
  - _Requirements: 4.4, 7.2_
```

```
- [ ] 9. Explore and search
  - Explore list with starter highlights, search filter, delayed badge, market banner, locked state
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 11.1, 11.2_
```

```
- [ ] 10. Stock detail and chart
  - Detail page, LineChart with 1M/3M/1Y/5Y (gated by chart.ranges), locked hints, trade markers (gated), disclaimer
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 3.3_
```

```
- [ ] 11. Watchlist
  - Add/remove UI with limit message and lock hint
  - _Requirements: 6.1, 6.2, 6.3_
```

```
- [ ] 12. Portfolio
  - Cash, equity, gain/loss, position rows, empty state, "Paper money" labeling
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
```

```
- [ ] 13. Order ticket
  - Quantity stepper, estimate, rationale chips and note, idempotent submit, confirmation, error mapping, market-closed wording
  - _Requirements: 8.1, 8.4, 8.5, 8.6, 8.7, 9.1_
```

```
- [ ] 14. Reflection and trade history
  - Reflection sheet after sells; history list with rationale and reflection
  - _Requirements: 9.2, 9.3, 10.1_
```

```
- [ ] 15. Guided trade step for lesson L1.4
  - Replace the placeholder GuidedTradeStep from the lesson engine spec with the guided ticket (starter list only, rationale required, celebration)
  - _Requirements: 8.1, 9.1_
```

```
- [ ] 16. Disclaimers and copy review
  - Persistent disclaimer on every price/trade screen; review all copy for advice-like language
  - _Requirements: 1.3, 13.1, 13.2_
```

```
- [ ] 17. Analytics events
  - Log trade_placed (side, symbol, qty, has_rationale), reflection_submitted, watchlist_changed, stock_viewed (no free text)
  - _Requirements: 8.4, 9.2_
```

```
- [ ] 18. Checkpoint
  - Device test: buy, sell, reflect, history; test after hours and on a weekend; confirm labels and invariants; review ingestion logs for a full trading day
```
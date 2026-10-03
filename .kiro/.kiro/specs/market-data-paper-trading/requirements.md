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
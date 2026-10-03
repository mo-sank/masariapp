---
inclusion: always
---
# Trading, Ledger, and Unlock Rules
 
## Money and quantities
- All money is integer cents. Starting paper cash: 1,000,000 cents ($10,000.00), read from app_config.starter_cash_cents.
- Quantities are whole shares (bigint) in the MVP.
- Prices come only from the quotes table (server side). The client never sends a price.
 
## Order rules (market orders only in MVP)
- Executed in Postgres function place_market_order inside one transaction, with the paper_accounts row locked FOR UPDATE.
- Fills immediately at quotes.price_cents. price_source is 'delayed_quote' when the market is open, 'last_close' otherwise. The UI must say which.
- Idempotency: (account_id, idempotency_key) is unique. A retried request returns the original order.
- Buy requires: unlock trade.market_buy; instrument is_active; instrument is_starter unless unlock trade.full_universe; enough cash; resulting position value <= app_config.starter_position_cap_cents unless unlock trade.raise_cap.
- Sell requires: unlock trade.market_sell; enough shares. Realized P&L = proceeds - proportional cost basis.
- Quote staleness: while the market is open, reject if quotes.updated_at is older than 30 minutes (quote_stale).
- Invariants (tests must assert): cash_cents >= 0; position qty > 0 (delete row at 0); cash + sum(position cost basis) changes only by realized P&L; replaying orders reproduces positions.
 
## Error codes (RPC exception messages the client maps to friendly text)
not_authenticated, no_account, invalid_order, feature_locked, symbol_not_available, no_quote, quote_stale, insufficient_cash, insufficient_shares, position_cap_exceeded, under_min_age, invalid_username, username_taken, unknown_lesson, prerequisite_not_completed, invalid_score.
 
## Feature keys and the lesson that unlocks each (MVP)
explore: L1.1 | watchlist: L1.2 | stock_detail: L1.3
trade.market_buy, portfolio, trade.rationale: L1.4
trade.market_sell, trade.history, trade.reflection: L1.5
daily_briefing: B1 | chart.ranges, chart.trade_markers: L2.1
Reserved for later: trade.raise_cap, trade.full_universe, trade.limit, trade.stop, trade.recurring, etf.trading, stress_lab, benchmark_line.
 
## Lesson/XP rules
- Pass score default 60 (L0 has none). First completion XP = lessons_catalog.xp_base, +5 if first attempt scored >= 90. Replays award 0 XP.
- Streak is counted in the user's local day. One missed day is covered by a Streak Freeze if the user has one. Boss completion grants +1 freeze (max 3).
 
## Market hours
- US regular session 9:30-16:00 America/New_York on weekdays, minus holidays in market_holidays (early closes at 13:00). Use public.market_is_open().
- Seed market_holidays from the official NYSE calendar and verify it each year.

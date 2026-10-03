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
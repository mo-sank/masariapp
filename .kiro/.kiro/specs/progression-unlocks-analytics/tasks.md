## Implementation Plan: Progression, Unlocks, and Evaluation


```
- [x] 1. Feature keys and unlock hooks
  - Create feature-keys.ts, useUnlocks/useUnlock, the Gate component, and the key-drift test against content files
  - _Requirements: 1.3, 1.5_
```

```
- [x] 2. Wire gating into every gated screen
  - Apply Gate/LockedState to Explore, Watchlist, stock detail, Trade, Portfolio, History, chart ranges and markers, Briefing; fail closed on load errors
  - _Requirements: 1.3, 1.5_
```

```
- [x] 3. Server-side unlock enforcement tests
  - pgTAP tests proving place_market_order, watchlist_add, submit_reflection, and get_daily_briefing reject without the right unlock; unlock granted only on first completion
  - _Requirements: 1.2, 1.4_
```

```
- [x] 4. Unlock celebration
  - UnlockCelebration component with animation, reduced-motion variant, and deep links to unlocked features from the results screen
  - _Requirements: 2.1, 2.2, 2.3_
```

```
- [x] 5. Stats display and ranks
  - StatsHeader on Learn and Profile; RankBadge; live updates after completion
  - _Requirements: 3.1, 3.2, 3.4, 3.5_
```

```
- [x] 6. Daily Market Briefing
  - get_daily_briefing RPC + tests; BriefingCard and three-card briefing screen; reviewed tip list; market-closed wording
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
```

```
- [x] 7. In-app feedback
  - feedback table/RPC with rate limit and tests; Settings > Send feedback screen
  - _Requirements: 5.1, 5.2, 5.3_
```

```
- [x] 8. Delayed review and Form B readiness
  - Create due rewind items 7 days after a boss; ensure assessment_results accepts Form B with identical concept tags; seed a placeholder Form B file
  - _Requirements: 6.1, 6.2_
```

```
- [x] 9. Evaluation views and report queries
  - Add v_assessment_gain, v_lesson_funnel, and docs/evaluation-queries.sql (funnel and dropout, median duration, first-trade rate within 24h, D1/D7 return, trades with vs without rationale, gains with n); revoke from authenticated
  - _Requirements: 6.3, 7.1, 7.2, 7.3_
```

```
- [x] 10. Config-driven limits
  - Ensure all caps and limits read from app_config on server and client; test changing a value
  - _Requirements: 8.1_
```

```
- [x] 11. Beta readiness
  - Create the EAS preview build; set up TestFlight and Android internal testing; complete the Beta Readiness checklist; run sessions with at least 5 teens and capture timing notes
  - _Requirements: 9.1, 9.2, 9.3_
```

```
- [~] 12. Checkpoint
  - End-to-end test with a fresh account: placement quiz, L1.1 to L1.5, boss B1, L2.1; confirm every unlock fires, trades work, briefing appears, evaluation queries return data
```
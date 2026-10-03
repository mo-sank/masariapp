```
# Design Document: Progression, Unlocks, and Evaluation
```

```
## Overview
Unlocks are data, not code branches. Lesson content declares which feature keys it unlocks; a sync script writes feature_unlock_rules; complete_lesson grants user_unlocks; the app and the database both check user_unlocks. A thin progress feature renders XP/streak/rank and unlock moments. Evaluation uses plain SQL views over events, lesson, and assessment tables.
```

```
## Architecture
content/lessons/*.json (unlocks[]) -> scripts/sync-catalog.ts -> feature_unlock_rules (seed) -> complete_lesson grants user_unlocks -> useUnlock(key) (TanStack Query over user_unlocks) -> UI gates; place_market_order and watchlist_add re-check unlocks server side.
```

```
## Components
- src/features/progress/feature-keys.ts: const FEATURE_KEYS = { explore, watchlist, stock_detail, 'trade.market_buy', portfolio, 'trade.rationale', 'trade.market_sell', 'trade.history', 'trade.reflection', daily_briefing, 'chart.ranges', 'chart.trade_markers' } with a type FeatureKey and a unit test asserting the keys equal those in content files (prevents drift).
- hooks: useUnlocks() (fetch all user_unlocks once, cache), useUnlock(key) -> { unlocked, unlockLesson }, useStats(), useRank().
- components: LockedState (copy from rule description + "Start lesson" button), UnlockCelebration (animation + description + "Try it now" deep link), StatsHeader (XP, streak, freezes), RankBadge.
- Feature gating pattern: <Gate feature="trade.market_buy" fallback={<LockedState .../>}>...</Gate>.
- Daily Briefing: BriefingCard on Learn tab; briefing screen with three swipe cards; data from rpc('get_daily_briefing').
- Feedback: Settings > Send feedback form -> rpc('submit_feedback').
```

```
## Server
- get_daily_briefing(): requires unlock daily_briefing; returns json { top_gainer, top_loser (starter stocks, % change from prev_close), portfolio_day_change_cents, market_state, tip_index } where tip_index = day-of-year mod tip count; tips live in the client as a reviewed template list.
- submit_feedback(category, message, screen): inserts with a daily rate limit of 10.
- Delayed review: when complete_lesson completes a boss for the first time, insert rewind_items for that unit's key concepts with due_at = now() + 7 days (extend complete_lesson or add a trigger-free helper called from it).
- Evaluation views: v_assessment_gain, v_lesson_funnel (DB reference section 6) plus docs/evaluation-queries.sql with the report queries; views revoked from authenticated.
```

```
## Rank mapping (MVP)
rank = 'Rookie' if B1 completed else 'Newcomer'. Reserved ranks per boss (B2 Chart Reader, B3 Risk Wrangler, B4 Order Pilot, B5 Market Thinker, C Masari Pro) are defined in config but unused.
```

```
## Data model
Uses user_unlocks, feature_unlock_rules, user_stats, badges, rewind_items, assessment_results, events, feedback, app_config (DB reference 3.1, 3.5, 3.6).
```

```
## Error handling
If user_unlocks fails to load, default to LOCKED (fail closed) and show a retry. If the briefing RPC fails, hide the card. Feedback errors keep the typed message so nothing is lost.
```

```
## Testing strategy
- Unit: feature-key drift test, Gate component (locked/unlocked), rank mapping.
- pgTAP: unlock granted only on first completion; place_market_order rejects without unlock; get_daily_briefing locked without B1; feedback rate limit; delayed review rows created after boss; evaluation views return expected counts on seeded fixtures and are not selectable by authenticated.
- Manual: complete L1.4 and confirm Trade/Portfolio unlock live; try to call the RPC without unlock using a test account and confirm the server blocks it.
```

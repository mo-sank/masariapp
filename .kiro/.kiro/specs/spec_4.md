Masari Spec 4: Progression, Unlocks, and Evaluation

_Folder in repo: .kiro/specs/progression-unlocks-analytics/. Build this after Specs 1, 2, and 3. It connects learning to trading, adds the celebratory moments and daily habit hooks, and builds the measurement tools for your report._

# What this spec delivers

The unlock system that ties lessons to brokerage features (client and server), unlock celebrations, XP, streaks, freezes and ranks on screen, the Daily Market Briefing, in-app feedback, a spaced re-quiz reminder, evaluation views for your report, and a beta-readiness pass.

# File: .kiro/specs/progression-unlocks-analytics/requirements.md

```
# Requirements Document: Progression, Unlocks, and Evaluation
```

```
## Introduction
This spec connects the lesson engine to the trading features through an unlock system, shows progress (XP, streaks, ranks), adds the Daily Market Briefing and in-app feedback, and provides evaluation tooling. It depends on specs foundation-auth-data, lesson-engine, and market-data-paper-trading, and follows .kiro/steering/*.md.
```

```
## Requirements
```

```
### Requirement 1: Unlock rules and checks
**User Story:** As a learner, I want new brokerage features to unlock as I learn, so that learning earns capability.
```

```
#### Acceptance Criteria
1. WHEN content is synced THEN feature_unlock_rules SHALL map each feature key to the lesson that unlocks it, exactly as listed in trading-and-data-rules.md.
2. WHEN a lesson is completed for the first time THEN complete_lesson SHALL insert user_unlocks rows for its features.
3. WHEN the app checks a feature THEN it SHALL use a single hook useUnlock(featureKey) backed by user_unlocks, with feature keys defined once in src/features/progress/feature-keys.ts.
4. WHEN the client shows a feature as available THEN the server SHALL independently enforce the same unlock (e.g., place_market_order checks trade.market_buy).
5. WHEN a feature is locked THEN the UI SHALL show a LockedState naming the lesson that unlocks it and a button that opens that lesson.
```

```
### Requirement 2: Unlock celebration
**User Story:** As a learner, I want unlocking a feature to feel rewarding.
```

```
#### Acceptance Criteria
1. WHEN the results screen receives unlocked feature keys THEN it SHALL show an unlock animation per feature with a short description of what it does.
2. WHEN the learner taps "Try it now" THEN the system SHALL deep-link to the unlocked feature (Explore, Watchlist, stock detail, Trade, Portfolio, History).
3. WHEN reduce-motion is on THEN the celebration SHALL use a static version.
```

```
### Requirement 3: XP, streaks, freezes, and ranks
**User Story:** As a learner, I want to see my XP, streak, and rank, so that I stay motivated.
```

```
#### Acceptance Criteria
1. WHEN the Learn tab and Profile tab render THEN they SHALL show XP total, current streak, longest streak, and Streak Freezes (0-3), read from user_stats.
2. WHEN the user completes units THEN the rank SHALL be derived from completed boss lessons (Rookie after B1; later ranks reserved) and shown on the Profile.
3. WHEN a day is missed and a Freeze is available THEN the next completion SHALL consume the Freeze and keep the streak, as implemented in complete_lesson.
4. WHEN streak or XP changes THEN the UI SHALL update without a manual refresh.
5. WHEN displaying streak days THEN the system SHALL use the user's timezone.
```

```
### Requirement 4: Daily Market Briefing
**User Story:** As a learner, I want a quick daily recap tied to what I have learned, so that I have a reason to open the app each day.
```

```
#### Acceptance Criteria
1. WHEN daily_briefing is unlocked THEN the Learn tab SHALL show a Briefing card that opens a three-card recap.
2. WHEN the briefing renders THEN card 1 SHALL show the top gainer and top loser among starter stocks, card 2 SHALL show the user's portfolio day change, and card 3 SHALL show a short "why prices move" tip from a rotating template list.
3. WHEN the market is closed THEN the briefing SHALL use the last close and say so.
4. WHEN the briefing is built THEN it SHALL come from the get_daily_briefing RPC using stored quotes (no AI-generated text, no recommendations).
```

```
### Requirement 5: In-app feedback
**User Story:** As the team running a beta, I want testers to send feedback from inside the app.
```

```
#### Acceptance Criteria
1. WHEN the user opens Settings > Send feedback THEN the system SHALL offer a category and a message (up to 1000 characters) and call submit_feedback with the current screen name.
2. WHEN a user sends more than 10 feedback items in a day THEN the system SHALL return a friendly limit message.
3. WHEN feedback is stored THEN it SHALL be readable only by the user and the team via the dashboard.
```

```
### Requirement 6: Spaced re-quiz and Form B readiness
**User Story:** As a researcher, I want delayed re-checks and a parallel test form, so that the report can show retained learning, not just immediate recall.
```

```
#### Acceptance Criteria
1. WHEN a unit boss is completed THEN the system SHALL schedule a delayed review (about 7 days) as due rewind_items for key concepts of that unit.
2. WHEN Form B items exist THEN the assessment mechanism SHALL record Form B results in assessment_results with the same concept tags as Form A.
3. WHEN the team queries v_assessment_gain THEN it SHALL return per-user Form A, Form B, and gain.
```

```
### Requirement 7: Evaluation views and exports
**User Story:** As the team, I want queries that report outcomes honestly, including dropout.
```

```
#### Acceptance Criteria
1. WHEN the team runs v_lesson_funnel THEN it SHALL show started vs completed counts per lesson.
2. WHEN the team runs the saved SQL snippets in docs/evaluation-queries.sql THEN they SHALL produce: completion and dropout by lesson, median lesson duration, first-trade rate within 24 hours, Day-1 and Day-7 return rates, trades with and without rationale, and pre/post gains with n.
3. WHEN evaluation queries run THEN they SHALL be unavailable to app users (views not granted to authenticated).
```

```
### Requirement 8: Tunable configuration
**User Story:** As the team, I want to adjust limits without a new release.
```

```
#### Acceptance Criteria
1. WHEN app_config values (starter cash, position cap, watchlist max, quote stale minutes) change THEN the server SHALL use the new values on the next request and the client SHALL read display values from app_config.
```

```
### Requirement 9: Beta readiness
**User Story:** As the team, I want to test with real teens safely.
```

```
#### Acceptance Criteria
1. WHEN a preview build is created THEN it SHALL distribute through TestFlight (iOS) and internal testing (Android) using the EAS preview profile.
2. WHEN beta testers are invited THEN the team SHALL have checked the Beta Readiness checklist in the setup guide (privacy policy live, terms live, account deletion works, disclaimers present, no secrets in the bundle).
3. WHEN testing sessions are held THEN the team SHALL record timed lesson completion and first-trade behavior for at least 5 teens.
```

# File: .kiro/specs/progression-unlocks-analytics/design.md

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

# File: .kiro/specs/progression-unlocks-analytics/tasks.md

```
# Implementation Plan: Progression, Unlocks, and Evaluation
```

```
- [ ] 1. Feature keys and unlock hooks
  - Create feature-keys.ts, useUnlocks/useUnlock, the Gate component, and the key-drift test against content files
  - _Requirements: 1.3, 1.5_
```

```
- [ ] 2. Wire gating into every gated screen
  - Apply Gate/LockedState to Explore, Watchlist, stock detail, Trade, Portfolio, History, chart ranges and markers, Briefing; fail closed on load errors
  - _Requirements: 1.3, 1.5_
```

```
- [ ] 3. Server-side unlock enforcement tests
  - pgTAP tests proving place_market_order, watchlist_add, submit_reflection, and get_daily_briefing reject without the right unlock; unlock granted only on first completion
  - _Requirements: 1.2, 1.4_
```

```
- [ ] 4. Unlock celebration
  - UnlockCelebration component with animation, reduced-motion variant, and deep links to unlocked features from the results screen
  - _Requirements: 2.1, 2.2, 2.3_
```

```
- [ ] 5. Stats display and ranks
  - StatsHeader on Learn and Profile; RankBadge; live updates after completion
  - _Requirements: 3.1, 3.2, 3.4, 3.5_
```

```
- [ ] 6. Daily Market Briefing
  - get_daily_briefing RPC + tests; BriefingCard and three-card briefing screen; reviewed tip list; market-closed wording
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
```

```
- [ ] 7. In-app feedback
  - feedback table/RPC with rate limit and tests; Settings > Send feedback screen
  - _Requirements: 5.1, 5.2, 5.3_
```

```
- [ ] 8. Delayed review and Form B readiness
  - Create due rewind items 7 days after a boss; ensure assessment_results accepts Form B with identical concept tags; seed a placeholder Form B file
  - _Requirements: 6.1, 6.2_
```

```
- [ ] 9. Evaluation views and report queries
  - Add v_assessment_gain, v_lesson_funnel, and docs/evaluation-queries.sql (funnel and dropout, median duration, first-trade rate within 24h, D1/D7 return, trades with vs without rationale, gains with n); revoke from authenticated
  - _Requirements: 6.3, 7.1, 7.2, 7.3_
```

```
- [ ] 10. Config-driven limits
  - Ensure all caps and limits read from app_config on server and client; test changing a value
  - _Requirements: 8.1_
```

```
- [ ] 11. Beta readiness
  - Create the EAS preview build; set up TestFlight and Android internal testing; complete the Beta Readiness checklist; run sessions with at least 5 teens and capture timing notes
  - _Requirements: 9.1, 9.2, 9.3_
```

```
- [ ] 12. Checkpoint
  - End-to-end test with a fresh account: placement quiz, L1.1 to L1.5, boss B1, L2.1; confirm every unlock fires, trades work, briefing appears, evaluation queries return data
```
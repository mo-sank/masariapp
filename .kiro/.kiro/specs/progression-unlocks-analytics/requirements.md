```
# Requirements Document
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
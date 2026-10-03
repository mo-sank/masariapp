---
inclusion: always
---
# Product: Masari
 
## What it is
Masari is a mobile app (iOS first, Android from the same codebase) that teaches teens how the stock market works. It combines Duolingo-style micro-lessons with a Robinhood-style PAPER-TRADING brokerage. Learning earns capability: completing lessons unlocks trading features.
 
## Audience
- Primary: ages 14-18. Minimum account age: 13 (hard rule, see security-privacy.md).
- Tone: friendly, playful, teen-native. Never childish, never preachy.
 
## Core loop (the MVP exists to prove this)
sign up -> placement quiz -> short lesson -> unlock a brokerage feature -> make a paper trade with a stated reason -> reflect on the result -> next lesson.
 
## Hard product rules
1. PAPER MONEY ONLY. No real money, no deposits, no real brokerage, no payments, no crypto.
2. Learning earns capability. Trading features are gated by lesson completion (see trading-and-data-rules.md for feature keys).
3. Process over returns. Never rank users by raw returns. Reward diversification, reasoning, and consistency.
4. Educational, not financial advice. Never recommend a specific security. Show disclaimers where prices or trades appear.
5. Lessons take 3-4 minutes. Every lesson ends with something the learner DOES, not just reads.
6. Mistakes are practice, not punishment: no hearts or lives. Missed questions go to a Rewind queue.
 
## MVP scope
IN: Auth, age gate, onboarding, learning path, lesson player, Placement Quest (L0), Unit 1 lessons (L1.1-L1.5) plus boss B1, lesson L2.1, XP + streaks, unlock system, delayed quotes for a ~50-stock universe, explore, stock detail, watchlist, paper account, market buy/sell, portfolio, trade history, pre-trade rationale, post-trade reflection, daily briefing, first-party analytics, in-app feedback, account deletion.
OUT (later): limit/stop orders, ETFs, options, fractional shares, leaderboards and leagues, push notifications, video, social features, real-time streaming quotes, candlestick charts, stress-test lab, Smart Investor Score.
 
## Success metrics
- >= 60% of new users complete L1.1 in their first session; >= 40% place a first paper trade within 24 hours.
- Day-1 and Day-7 retention tracked from the first beta.
- Learning gain: placement Form A vs Form B score change, reported with completion/dropout rates (not just completers).
 
## Reference docs
- docs/lesson-plan.md: full 6-unit lesson plan and unlock ladder.
- docs/db-and-api-reference.md: schema, RLS, RPCs, Edge Functions.

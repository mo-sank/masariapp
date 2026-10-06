# Bugfix Requirements Document

## Introduction

After a signed-in learner completes boss lesson B1, the `daily_briefing` feature unlocks and a "Daily Market Briefing" card appears on the Learn tab. Tapping the card appears to do nothing: the learner stays on (or immediately returns to) the Learn tab and never sees the three-card briefing. This blocks a reward the learner has earned and makes the unlock look broken.

Observed cause: tapping the card navigates to `/briefing`, but the app's auth routing gate does not recognise `/briefing` as a signed-in route. It treats the navigation as a move onto the wrong branch and immediately replaces the route with `/(tabs)/learn`, so the learner sees no change.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a signed-in learner who has unlocked `daily_briefing` taps the Daily Market Briefing card on the Learn tab THEN the system redirects back to `/(tabs)/learn` and the briefing screen is never shown, so the tap appears to do nothing

1.2 WHEN a signed-in learner is routed to `/briefing` by any means (card tap, deep link, or programmatic navigation) THEN the system classifies `/briefing` as not belonging to the signed-in branch and replaces it with `/(tabs)/learn`

1.3 WHEN a signed-in learner who has not yet unlocked `daily_briefing` is routed to `/briefing` THEN the system redirects to `/(tabs)/learn` instead of showing the briefing screen's locked state naming lesson B1

### Expected Behavior (Correct)

2.1 WHEN a signed-in learner who has unlocked `daily_briefing` taps the Daily Market Briefing card on the Learn tab THEN the system SHALL open the Daily Market Briefing screen at `/briefing` and keep it displayed

2.2 WHEN a signed-in learner is routed to `/briefing` THEN the system SHALL treat `/briefing` as part of the signed-in branch and SHALL NOT redirect away from it

2.3 WHEN a signed-in learner who has not yet unlocked `daily_briefing` is routed to `/briefing` THEN the system SHALL stay on `/briefing` and show the locked state naming lesson B1 with a "Start lesson" action

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a signed-in learner has not unlocked `daily_briefing` THEN the system SHALL CONTINUE TO hide the Daily Market Briefing card on the Learn tab (no locked state shown there)

3.2 WHEN the unlocks check is loading or has failed THEN the system SHALL CONTINUE TO keep the briefing gated (fail closed), showing the loading placeholder or a retry rather than the briefing content

3.3 WHEN a signed-in learner navigates to existing signed-in routes (`/learn`, `/explore`, `/portfolio`, `/profile`, `/lesson/*`, `/rewind`, `/settings/*`, `/stock/*`, `/trade/*`, `/history`) THEN the system SHALL CONTINUE TO allow the navigation without redirecting

3.4 WHEN a user who is signed out, age-blocked, or still in onboarding is routed to `/briefing` or any signed-in route THEN the system SHALL CONTINUE TO redirect them to the correct branch (welcome/age gate, age-block, or onboarding)

3.5 WHEN the app starts on the bare index route (`/`) THEN the system SHALL CONTINUE TO perform the initial redirect into the appropriate branch

3.6 WHEN a user moves within the auth flow (age gate to welcome) or between tabs THEN the system SHALL CONTINUE TO leave that navigation uninterrupted

3.7 WHEN the briefing screen is open and unlocked THEN the system SHALL CONTINUE TO load data from the `get_daily_briefing` RPC and show the loading, error-with-retry, and three-card states as before

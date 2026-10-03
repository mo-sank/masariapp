Masari Spec 2: Lesson Engine and Learning Path

_Folder in repo: .kiro/specs/lesson-engine/. Build this after Spec 1 is complete. Also put docs/lesson-plan.md (your lesson plan) in the repo: Kiro uses it to author lesson content._

# What this spec delivers

The Duolingo half of Masari: a learning path, a lesson player with several activity types, hands-on labs, XP and streaks, a placement quiz, a Rewind (spaced review) queue, and authored content for L0, L1.1 to L1.5, boss B1, and L2.1.

# File: .kiro/specs/lesson-engine/requirements.md

```
# Requirements Document: Lesson Engine and Learning Path
```

```
## Introduction
This spec builds the lesson content model, learning path, lesson player, activity types, hands-on labs, scoring and completion, placement quiz, and Rewind queue. It depends on spec foundation-auth-data and follows .kiro/steering/*.md and docs/db-and-api-reference.md. Lesson content comes from docs/lesson-plan.md.
```

```
## Requirements
```

```
### Requirement 1: Lesson content model and validation
**User Story:** As a content author, I want lessons stored as validated JSON files, so that I can add and edit lessons without touching app code.
```

```
#### Acceptance Criteria
1. WHEN a lesson file is added under content/lessons THEN the system SHALL validate it against the Zod lesson schema in `npm run validate:content`.
2. WHEN validation fails THEN the system SHALL print the file, step id, and reason, and CI SHALL fail.
3. WHEN lessons are validated THEN lesson ids SHALL be unique, prerequisites SHALL exist, step ids SHALL be unique within a lesson, and every scored item SHALL have a concept tag.
4. WHEN the sync script runs THEN lessons_catalog and feature_unlock_rules seed SQL SHALL be generated from the content files.
```

```
### Requirement 2: Learning path
**User Story:** As a learner, I want to see a path of lessons with what is next and what I will unlock, so that I stay motivated.
```

```
#### Acceptance Criteria
1. WHEN the Learn tab opens THEN the system SHALL show lessons grouped by unit as a vertical path with nodes for lessons, boss battles, and the placement quest.
2. WHEN a lesson's prerequisite is completed THEN its node SHALL be available; WHEN not THEN it SHALL be locked and non-tappable with a hint.
3. WHEN a node is shown THEN it SHALL display title, an estimated 3-4 minutes, and the feature(s) it unlocks.
4. WHEN the learner has unfinished work THEN the system SHALL show a prominent "Continue" call to action for the next available lesson.
5. WHEN progress or XP changes THEN the path, XP, and streak SHALL refresh.
```

```
### Requirement 3: Lesson player
**User Story:** As a learner, I want a smooth, short lesson with instant feedback, so that learning feels like a game.
```

```
#### Acceptance Criteria
1. WHEN a lesson starts THEN the system SHALL show a progress bar and present steps one at a time.
2. WHEN the learner answers a scored step THEN the system SHALL show immediate correct/incorrect feedback with a short explanation before continuing.
3. WHEN the learner exits mid-lesson THEN the system SHALL confirm, and SHALL resume at the same step if the lesson is reopened in the same session.
4. WHEN haptics are available THEN the system SHALL use light haptics for correct and incorrect feedback and SHALL respect reduce-motion settings.
5. WHEN a lesson is authored THEN its estimated time SHALL be 3-4 minutes, and the analytics SHALL record the actual duration.
```

```
### Requirement 4: Activity (step) types
**User Story:** As a learner, I want varied activities, so that I engage critically instead of just reading.
```

```
#### Acceptance Criteria
1. WHEN a step has type cards THEN the system SHALL show swipeable micro-cards.
2. WHEN a step has type mcq or truefalse THEN the system SHALL support single-answer questions with an explanation; the mcq variant "explain" SHALL ask the learner to pick the best explanation.
3. WHEN a step has type predict THEN the system SHALL require a choice before revealing the result, and SHALL show the outcome.
4. WHEN a step has type sort THEN the system SHALL support dragging or tapping items into labeled buckets and validate them.
5. WHEN a step has type match THEN the system SHALL support pairing terms with definitions.
6. WHEN a step has type sim THEN the system SHALL render the registered lab component by simId and receive a score and result summary.
7. WHEN a step has type guided_trade THEN the system SHALL render the trading order ticket in guided mode (provided by spec market-data-paper-trading; until then, a labeled placeholder).
8. WHEN a step component is implemented THEN it SHALL be pure (props in, onAnswer out) with no network calls.
```

```
### Requirement 5: Scoring and completion
**User Story:** As a learner, I want XP, streaks, and unlocks when I finish, so that I feel progress.
```

```
#### Acceptance Criteria
1. WHEN a lesson ends THEN the score SHALL equal the percentage of scored items answered correctly on the first try; sims MAY contribute a score when marked scored.
2. WHEN the lesson ends THEN the system SHALL call complete_lesson with score, duration, and per-item answers.
3. WHEN the score is below the pass score THEN the system SHALL show an encouraging retry screen and SHALL NOT mark the lesson completed.
4. WHEN complete_lesson returns THEN the results screen SHALL show XP earned, streak, any Streak Freeze, and the newly unlocked features, with a button to go to the unlocked feature.
5. WHEN the network is unavailable at completion THEN the system SHALL queue the completion locally and retry, without losing the result.
6. WHEN a lesson is replayed THEN the system SHALL allow it and award no extra XP.
```

```
### Requirement 6: Placement Quest (L0)
**User Story:** As a new learner, I want a quick quiz so the app knows my starting point, and so the team can measure learning gains.
```

```
#### Acceptance Criteria
1. WHEN a new user finishes onboarding THEN the system SHALL present the Placement Quest as the first node.
2. WHEN L0 runs THEN it SHALL present 10 fixed Form A items tagged by concept (money basics, stock basics, risk) and SHALL NOT use pass/fail language or reveal correct answers.
3. WHEN L0 completes THEN the system SHALL store an assessment_results row (form A, score, per-item results) and complete L0.
4. WHEN Form B content exists later THEN the same mechanism SHALL record Form B results.
```

```
### Requirement 7: Rewind queue
**User Story:** As a learner, I want missed questions to come back later, so that mistakes become practice instead of punishment.
```

```
#### Acceptance Criteria
1. WHEN a scored item is answered incorrectly THEN the system SHALL save it to rewind_items.
2. WHEN the Learn tab opens and items are due THEN the system SHALL show a Rewind card with the count.
3. WHEN a Rewind session runs THEN it SHALL present up to 5 due items (about 90 seconds) and call review_rewind_item for each.
4. WHEN an item is answered correctly THEN its box SHALL increase and its next due date SHALL move out (1, 3, 7, 14 days); WHEN incorrectly THEN it SHALL reset to due now.
```

```
### Requirement 8: Hands-on labs for the first lessons
**User Story:** As a learner, I want to learn by doing, so that ideas stick.
```

```
#### Acceptance Criteria
1. WHEN L1.1 runs THEN the ownership_split lab SHALL let the learner sell shares of a lemonade-stand company to raise a target amount while keeping a minimum ownership percentage, showing ownership change live.
2. WHEN L1.2 runs THEN the auction lab SHALL show simulated buyers and sellers and let the learner apply headline cards and watch the price react.
3. WHEN L1.5 runs THEN the pnl_replay lab SHALL fast-forward a price path and ask the learner to sell or hold, then compute realized vs unrealized profit and loss.
4. WHEN B1 runs THEN the opening_bell lab SHALL play a 90-second fictional trading day with headline events and score the learner on interpreting each event.
5. WHEN any lab uses randomness THEN it SHALL use a seeded random number generator so behavior is testable and repeatable.
```

```
### Requirement 9: Content authoring
**User Story:** As the team, I want the first lessons authored and reviewed, so that the MVP is usable end to end.
```

```
#### Acceptance Criteria
1. WHEN content authoring is complete THEN content/lessons SHALL contain L0, L1.1, L1.2, L1.3, L1.4, L1.5, B1, and L2.1 matching docs/lesson-plan.md.
2. WHEN a lesson is authored THEN it SHALL include a hook, 60-second learn cards, a do activity, and a check, with 8th-grade reading level and no recommendation of specific securities.
3. WHEN a human review is done THEN the checklist in the design document SHALL be completed for each lesson.
```

```
### Requirement 10: Lesson analytics
**User Story:** As the team, I want lesson events logged, so that we can measure completion and learning.
```

```
#### Acceptance Criteria
1. WHEN a lesson starts, a step is answered, a lesson completes, or a Rewind session finishes THEN the system SHALL log lesson_started, step_answered, lesson_completed, or rewind_session_completed with lesson id, step id, correctness, and duration (no free text).
```

# File: .kiro/specs/lesson-engine/design.md

```
# Design Document: Lesson Engine and Learning Path
```

```
## Overview
Lessons are JSON files bundled into the app (content/lessons). A pure scoring module and a Zustand session store drive a lesson player that renders steps through a registry of step components. Completion goes through the complete_lesson RPC. Content ships with the app and can be updated over the air with EAS Update.
```

```
## Architecture
content/lessons/*.json -> loader (src/features/lessons/content.ts) -> Learn tab (path) -> lesson/[id] player -> StepRenderer registry -> step components and sims -> session store (answers, score) -> complete_lesson RPC -> results screen -> invalidate queries (progress, stats, unlocks).
```

```
## Content schema (src/features/lessons/schema.ts, Zod)
Top level: id, unit, order, kind ('placement'|'lesson'|'boss'), title, bigIdea, estimatedMinutes, xp, passScore, prerequisite (id or null), concepts[], unlocks[] (feature keys), steps[].
Steps (discriminated union on `type`), each with id and optional `scored` and `concept`:
- cards: cards[{ title?, body, emoji? }]
- mcq: prompt, options[{id,text}], correctId, explanation, variant ('standard'|'explain')
- truefalse: prompt, answer, explanation
- predict: prompt, options[{id,text}], correctId?, reveal (text), scored (default false)
- sort: prompt, buckets[{id,label}], items[{id,text,bucketId}], explanation
- match: prompt, pairs[{id,left,right}], explanation
- sim: simId ('ownership_split'|'auction'|'pnl_replay'|'opening_bell'), params (per sim, validated), goal, scored (default false)
- guided_trade: symbols ('starter'), requireRationale (true)
```

```
### Example (abridged) content/lessons/L1.1.json
{
  "id": "L1.1", "unit": 1, "order": 1, "kind": "lesson", "title": "Slice the Pizza",
  "bigIdea": "A share is a small slice of ownership in a company.",
  "estimatedMinutes": 3, "xp": 10, "passScore": 60, "prerequisite": "L0",
  "concepts": ["shares", "ownership"], "unlocks": ["explore"],
  "steps": [
    { "id": "s1", "type": "predict", "prompt": "You own 1 of 100 slices of a pizza shop. What do you own?",
      "options": [{"id":"a","text":"1% of the shop"},{"id":"b","text":"1 pizza"},{"id":"c","text":"Nothing yet"}],
      "correctId": "a", "reveal": "Right: a share is a slice of the whole company, not a product.", "scored": true, "concept": "ownership" },
    { "id": "s2", "type": "cards", "cards": [
        {"title":"Companies sell slices","body":"To raise money, a company can sell small pieces of itself called shares."},
        {"title":"Owners share the upside","body":"If the company grows in value, each slice can be worth more."} ] },
    { "id": "s3", "type": "sim", "simId": "ownership_split", "goal": "Raise $400 for a new cart but keep at least 51% of your shop.",
      "params": { "totalShares": 100, "pricePerShareCents": 2500, "targetRaiseCents": 40000, "minOwnerPct": 51 }, "scored": true, "concept": "dilution" },
    { "id": "s4", "type": "mcq", "variant": "explain", "prompt": "Why did your ownership percentage drop after selling shares?",
      "options": [{"id":"a","text":"You gave away part of the company in exchange for cash"},{"id":"b","text":"The price fell"}],
      "correctId": "a", "explanation": "Selling shares trades ownership for cash.", "scored": true, "concept": "dilution" }
  ]
}
```

```
## Components and interfaces
- src/features/lessons/schema.ts: Zod schemas and inferred types.
- content.ts: static map of lesson id -> parsed JSON (validated at build and dev start); getLesson(id), listLessons().
- scoring.ts (pure): scoreLesson(answers, steps) -> { scorePct, perItem[] }.
- rng.ts (pure): mulberry32(seed) seeded RNG used by sims.
- store/session.ts (Zustand): lessonId, stepIndex, answers[], startedAt, status ('idle'|'playing'|'feedback'|'done'); actions answer(), next(), exit(), resumeIfSameSession().
- components/LessonPlayer.tsx: progress bar, StepRenderer, FeedbackSheet, ExitConfirm.
- components/steps/*: CardsStep, McqStep, TrueFalseStep, PredictStep, SortStep, MatchStep, SimStep, GuidedTradeStep (placeholder until trading spec).
- components/sims/*: OwnershipSplit, Auction, PnlReplay, OpeningBell. A SimRegistry maps simId to component. Each sim: props { params, seed, onComplete({ score, summary }) }.
- hooks: useLessonProgress(), useStats(), useCompleteLesson() (mutation with offline queue), useRewind().
- screens: Learn tab (PathView, UnitHeader, LessonNode, ContinueCard, RewindCard), lesson/[id], results screen, rewind session screen.
```

```
## Learning path logic
status(lesson) = completed if lesson_progress.status = 'completed'; available if prerequisite completed (or none); else locked. Continue CTA = first available non-completed lesson by unit and order. Locked nodes show "Finish <prerequisite title> first".
```

```
## Completion flow
1. Session ends -> scoreLesson -> useCompleteLesson.mutate({ lessonId, score, durationMs, answers }).
2. On success, results screen shows xp_awarded, streak, streak_freezes, unlocked[]; invalidate ['progress'], ['stats'], ['unlocks'].
3. On network failure, persist the payload to the queue (AsyncStorage), show "Saved, will sync", and retry on app foreground. Server calls are safe to repeat.
4. Missed scored items -> save_rewind_items. L0 additionally calls submit_assessment.
```

```
## Sim designs (deterministic, seeded)
- ownership_split: state sharesSold; ownership% = (total - sold)/total; raise = sold * price. Score 100 if raise >= target and ownership >= min; 60 if only one met; else 30 with a hint and one retry.
- auction: N bot buyers/sellers; each round price' = price * (1 + k * (demand - supply) / (demand + supply)) + small seeded noise. Learner picks a headline card that shifts bot demand or supply, predicts direction first, then sees the result. Score = correct predictions / rounds.
- pnl_replay: fixed or seeded price path; learner "bought" at index i; plays forward and chooses sell/hold at a prompt; show unrealized then realized P&L; then a sort step classifies statements.
- opening_bell: 5 headline events over 90 seconds on a fictional stock; at each event the learner picks the best interpretation (mcq-like) then buy/hold/sell for practice (not scored on returns). Score = correct interpretations / events.
```

```
## Rewind scheduling
Boxes 0-4 with intervals 0, 1, 3, 7, 14 days. review_rewind_item(correct) moves the box and due_at. Learn tab queries due items (due_at <= now) count.
```

```
## Content review checklist (per lesson)
- Takes 3-4 minutes in a timed playthrough.
- Reading level about 8th grade; no jargon without a definition.
- Has hook, learn, do, check; the "do" is hands-on.
- No recommendation of specific securities; fictional scenarios labeled "simulation".
- Every scored item has a concept tag and a short explanation.
- Maps to the correct unlock in docs/lesson-plan.md.
```

```
## Error handling
Invalid content stops the build in CI and shows a dev-only error screen locally. RPC errors map to friendly messages. Missing lesson id shows a "lesson not found" state.
```

```
## Testing strategy
- Unit: scoring, rng determinism, path status logic, rewind box math, content schema (valid and invalid fixtures).
- Component: each step type (answer, feedback), PathView states, results screen.
- Sim tests: with fixed seeds, outputs are identical across runs.
- Database: complete_lesson (prerequisite enforced, pass threshold, XP only on first completion, first-try bonus, streak rules including freeze, unlock granting, boss freeze) and rewind functions via pgTAP.
- Manual: timed playthrough of every authored lesson on a device.
```

# File: .kiro/specs/lesson-engine/tasks.md

```
# Implementation Plan: Lesson Engine and Learning Path
```

```
- [ ] 1. Content schema and validation
  - Implement Zod schemas in src/features/lessons/schema.ts for all step types
  - Write scripts/validate-content.ts and the npm script; add valid/invalid test fixtures; add to CI
  - _Requirements: 1.1, 1.2, 1.3_
```

```
- [ ] 2. Database for learning
  - Migrations for lessons_catalog, feature_unlock_rules, lesson_progress, lesson_attempts, assessment_results, user_unlocks, badges, rewind_items (DB reference section 3.5) with RLS
  - Add complete_lesson (5.3), submit_assessment, save_rewind_items, review_rewind_item RPCs with grants
  - pgTAP tests for XP, streak, freeze, prerequisites, pass threshold, unlock granting
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 7.1, 7.4_
```

```
- [ ] 3. Catalog sync script
  - Write scripts/sync-catalog.ts to generate seed SQL for lessons_catalog and feature_unlock_rules from content files
  - _Requirements: 1.4_
```

```
- [ ] 4. Content loader and session store
  - Implement content.ts, scoring.ts (pure, tested), rng.ts (tested), and the Zustand session store
  - _Requirements: 3.1, 3.3, 5.1, 8.5_
```

```
- [ ] 5. Lesson player shell
  - Build LessonPlayer with progress bar, StepRenderer registry, FeedbackSheet, exit confirm, haptics, reduce-motion support
  - Route lesson/[id] and wire analytics events
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.1_
```

```
- [ ] 6. Core step components
  - CardsStep (swipe), McqStep (standard + explain), TrueFalseStep with accessibility labels and tests
  - _Requirements: 4.1, 4.2, 4.8_
```

```
- [ ] 7. Interactive step components
  - PredictStep, SortStep (drag with tap fallback), MatchStep with tests
  - _Requirements: 4.3, 4.4, 4.5, 4.8_
```

```
- [ ] 8. Sim framework and first two labs
  - SimStep + SimRegistry; implement OwnershipSplit and Auction with seeded RNG and tests
  - _Requirements: 4.6, 8.1, 8.2, 8.5_
```

```
- [ ] 9. Remaining labs
  - Implement PnlReplay and OpeningBell with tests; add GuidedTradeStep placeholder
  - _Requirements: 4.7, 8.3, 8.4_
```

```
- [ ] 10. Learning path screen
  - Build PathView, UnitHeader, LessonNode, ContinueCard with available/locked/completed states and unlock previews
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
```

```
- [ ] 11. Completion flow and offline queue
  - useCompleteLesson mutation, results screen (XP, streak, freeze, unlocks, go-to-feature button), retry screen for sub-pass scores, AsyncStorage queue with retry
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
```

```
- [ ] 12. Placement Quest (L0)
  - Author L0 Form A (10 items), assessment submission, no-reveal results copy, Learn tab first-node behavior
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
```

```
- [ ] 13. Rewind queue
  - Save missed items, RewindCard on Learn tab, Rewind session screen calling review_rewind_item
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.1_
```

```
- [ ] 14. Author lesson content
  - Using docs/lesson-plan.md and the content review checklist, author L1.1, L1.2, L1.3, L1.4, L1.5, B1, L2.1 as JSON; run validate:content and sync-catalog
  - Hand the content to a human for review before marking complete
  - _Requirements: 9.1, 9.2, 9.3_
```

```
- [ ] 15. Checkpoint
  - Timed playthrough of every lesson on a device (target 3-4 minutes); fix pacing; confirm XP, streak, unlocks, and Rewind behave end to end
```
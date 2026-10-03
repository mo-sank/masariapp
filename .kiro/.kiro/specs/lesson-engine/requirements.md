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
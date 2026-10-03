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

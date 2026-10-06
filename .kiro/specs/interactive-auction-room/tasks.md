# Implementation Plan: Interactive Auction Room

## Overview

Enhance the existing L1.2 `auction` simulation as a TypeScript/React Native mini-game without changing the lesson-engine contract or authored lesson content. Implementation stays in `src/features/lessons/sims/auction.ts` and `src/features/lessons/components/sims/Auction.tsx`; behavior is verified beside each increment in their existing Jest test modules. The plan preserves the current seeded price formula and one-RNG-draw-per-round budget, adds deterministic market projections with no RNG cost, and finishes by wiring the guarded game loop, accessible market UI, and presentation-only motion back through the unchanged `auction` registry entry.

## Tasks

- [x] 1. Harden the pure auction input contract and legacy defaults
  - [x] 1.1 Implement bounded params and seed validation in `src/features/lessons/sims/auction.ts`
    - Tighten `auctionParamsSchema` so the starting price is a positive safe integer; baseline totals are integers in `0..1,000,000`; headline deltas are integers in `-1,000,000..1,000,000`; sensitivity and noise are finite and bounded; rounds are positive integers; and two to four headlines have non-empty, unique ids and text.
    - Preserve the strict throwing `parseAuctionParams` API, add `safeParseAuctionParams`, add finite uint32 `isValidAuctionSeed` validation without coercion, and add optional `showMarketDepth` defaulting to `true` while preserving the existing `noise = 0.01` default.
    - Keep the existing L1.2 params shape accepted without modifying `content/lessons/L1.2.json` or adding dependencies.
    - _Requirements: 1.6, 2.1, 2.2, 4.1, 9.1, 9.2, 9.3_

  - [x] 1.2 Write the generated parser compatibility property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 1: Legacy params parse with bounded values and documented defaults**
    - Exercise explicit boundary fixtures and at least 100 dependency-free cases generated with `mulberry32`; verify authored values survive parsing and omitted `noise` and `showMarketDepth` receive their documented defaults.
    - Add the exact feature/property comment and include the generation seed in any failure output so a case can be replayed.
    - **Validates: Requirements 4.1, 9.2, 9.3**

  - [x] 1.3 Add focused params and seed boundary tests in `src/features/lessons/sims/auction.test.ts`
    - Cover strict-parser throws versus safe-parser results, explicit `showMarketDepth: false`, duplicate ids, headline count limits, integer/range/finite-number failures, and every invalid seed category including strings, fractions, negatives, overflow, `NaN`, and infinities.
    - Verify valid uint32 boundaries and the existing legacy fields remain accepted.
    - _Requirements: 1.6, 4.1, 9.1, 9.2, 9.3_

- [x] 2. Add deterministic crowd, price, bid/ask, and order-book primitives
  - [x] 2.1 Implement bounded crowd totals and preserve the price update in `src/features/lessons/sims/auction.ts`
    - Add `AuctionTotals` and `deriveCrowdTotals`, clamping each baseline-plus-delta result to an integer in `0..1,000,000`, and make `applyHeadline` use the helper.
    - Retain the existing algebra for imbalance plus bounded seeded noise, including zero imbalance when the denominator is zero, nearest-cent rounding, a one-cent floor, and deterministic `up` direction for a tie.
    - Call the supplied RNG exactly once on every applied round, including when authored noise is zero; do not introduce `Math.random`, clock reads, networking, or any other entropy source.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 4.8, 6.1, 6.2, 6.4_

  - [x] 2.2 Write the generated crowd-bound property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 3: Headline adjustments produce bounded whole-number crowd totals**
    - Run boundary fixtures and at least 100 seeded generated baseline/delta combinations, checking exact lower and upper clamp behavior on both sides.
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.3 Write the generated price-formula and RNG-budget property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 4: A round applies the exact formula with one draw and a valid price**
    - Use counting and controlled RNGs across at least 100 generated cases to compare the exact expected formula, zero-total behavior, noise bounds, rounding, one-cent floor, and exactly one draw per call.
    - **Validates: Requirements 2.3, 2.4, 2.5, 6.4**

  - [x] 2.4 Implement deterministic market snapshots in `src/features/lessons/sims/auction.ts`
    - Add `MarketDepthLevel`, `AuctionMarketSnapshot`, and `deriveMarketSnapshot` using the approved half-spread, bid, ask, spread, imbalance, side-fraction, tick, common-scale, and three-level quantity formulas.
    - Return `null` for unavailable or invalid price/balance input without mutating any session data; guarantee `askCents >= bidCents >= 1`, non-negative spread, exact depth-quantity sums, and zero fractions/levels for a zero-total market.
    - Keep the helper pure and RNG-free so any number of quote/depth derivations consumes zero seeded draws.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 6.1_

  - [x] 2.5 Write the generated market-snapshot property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 5: Market snapshots are deterministic, proportional, ordered, and RNG-neutral**
    - Across boundary fixtures and at least 100 seeded cases, check repeat equality, quote ordering, non-negative spread, side proportions, exact depth sums/common scaling, zero-total output, and an unchanged RNG sequence around arbitrary snapshot calls.
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [x] 2.6 Write the generated direction property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 6: Direction is derived only from the signed price change**
    - Generate at least 100 positive before/after cent relationships through controlled round inputs and verify increases and ties resolve to `up`, decreases resolve to `down`, and headline wording or intended mood cannot override the computed change.
    - **Validates: Requirements 4.8**

  - [x] 2.7 Add focused crowd, quote, and formula regressions in `src/features/lessons/sims/auction.test.ts`
    - Cover both crowd clamps, both-zero totals, tie direction, positive whole-cent output, three-level price/quantity ordering, zero depth, proportional common scaling, unavailable snapshots, and one draw when noise is zero.
    - Spy on ambient randomness and clock APIs during pure replay so accidental entropy use fails the test.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 3.5, 4.8, 6.1, 6.2, 6.4_

- [x] 3. Extend deterministic replay, grading, and reporting
  - [x] 3.1 Implement optional prediction grading in `src/features/lessons/sims/auction.ts`
    - Make `AuctionChoice.prediction` optional for pure replay only; still apply every referenced headline and consume one round draw, but count a missing prediction as incorrect.
    - Preserve explicit unknown-headline errors containing the bad id, carried prices, and deterministic replay order.
    - Centralize final scoring as zero for no played rounds or otherwise `clamp(round(correct / total * 100), 0, 100)`, and keep summary counts aligned with `correct` and `total`.
    - _Requirements: 1.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 6.4, 9.4_

  - [x] 3.2 Write the generated replay-grading property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 7: Replay grading and reporting match committed predictions**
    - Run empty, missing, correct, incorrect, and at least 100 seeded generated choice sequences; verify totals, exact correct count, integer/clamped score, final price, and summary counts.
    - **Validates: Requirements 1.5, 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 3.3 Write the generated fixed-seed replay property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 8: Fixed-seed replay is identical**
    - For at least 100 generated valid params, uint32 seeds, and choice sequences, compare independent `scoreAuction` calls using fresh `mulberry32(seed)` generators for deep equality of rounds, prices, directions, counts, score, final price, and summary.
    - **Validates: Requirements 6.1, 6.3**

  - [x] 3.4 Write the generated unknown-headline property test in `src/features/lessons/sims/auction.test.ts`
    - **Property 9: Unknown headline choices fail explicitly**
    - Generate at least 100 ids disjoint from each authored id set and verify replay throws an error containing the exact unknown id without skipping, substituting, or drawing a round result.
    - **Validates: Requirements 9.4**

  - [x] 3.5 Add focused scoring and replay regressions in `src/features/lessons/sims/auction.test.ts`
    - Cover an absent prediction that still advances one draw, singular/plural summary copy, empty replay, score bounds, multi-round price carry, unknown ids, and established same-seed/different-seed behavior.
    - _Requirements: 1.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 6.4, 9.4_

- [x] 4. Checkpoint - Ensure pure auction tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Build the safe component boundary and guarded live-session machine
  - [x] 5.1 Add inert component input validation in `src/features/lessons/components/sims/Auction.tsx`
    - Keep `Auction` publicly assignable to `SimComponentProps` with only `params`, `seed`, and `onComplete`; compose `safeParseAuctionParams` and `isValidAuctionSeed` before mounting any game RNG or animation state.
    - Render a persistent, non-crashing `AuctionErrorState` for invalid input, without raw param output or completion; mount a private typed `AuctionGame` subtree only for validated params and seed.
    - _Requirements: 1.1, 1.4, 1.6, 9.1_

  - [x] 5.2 Write the generated invalid-input component property test in `src/features/lessons/components/sims/Auction.test.tsx`
    - **Property 2: Invalid input remains an inert error state**
    - Exercise single-field invalid params mutations and invalid seed categories across at least 100 generated cases; assert stable error copy, no game controls/transitions, strict-parser failure when applicable, and zero `onComplete` calls.
    - **Validates: Requirements 1.6, 9.1**

  - [x] 5.3 Implement the guarded `choose -> predict -> reveal -> completed` machine in `src/features/lessons/components/sims/Auction.tsx`
    - Replace independently mutable round fields with a discriminated session state containing round index, carried price, selected headline, locked prediction, preview totals, current result, and immutable history.
    - Create exactly one `mulberry32(seed)` instance for live play. Guard every event with a synchronously updated state ref so duplicate or stale headline, prediction, next, and finish taps are no-ops before React batching can admit them.
    - Apply a headline exactly once only after an `up` or `down` prediction is locked, append one record, carry the revealed price to the next round, reset crowd totals to authored baselines, and expose next versus finish only in the correct reveal.
    - Enter `completed` and set an at-most-once completion ref before calling `onComplete`; derive the clamped score and count summary from committed history without extra live RNG draws, and reject all later events.
    - _Requirements: 1.3, 1.4, 1.5, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.4, 6.1, 6.3, 6.4_

  - [x] 5.4 Write the generated interaction-lock property test in `src/features/lessons/components/sims/Auction.test.tsx`
    - **Property 10: The interaction machine locks selection and prediction**
    - Drive at least 100 seeded sequences containing legal, duplicate, invalid, early, and conflicting events; verify reveal requires one known headline and one direction, creates at most one round record, retains locked values, and never completes an unfinished session.
    - **Validates: Requirements 1.4, 4.3, 4.4, 4.5**

  - [x] 5.5 Write the generated live-versus-oracle property test in `src/features/lessons/components/sims/Auction.test.tsx`
    - **Property 11: Live play is equivalent to the replay oracle**
    - Complete at least 100 generated sessions and compare live history/outcome with `scoreAuction` using a fresh `mulberry32(seed)`; use counting RNG seams or spies to prove exactly one draw per applied round in both paths.
    - **Validates: Requirements 6.3, 6.4**

  - [x] 5.6 Write the generated completion-boundary property test in `src/features/lessons/components/sims/Auction.test.tsx`
    - **Property 12: Completion is emitted exactly once**
    - Across at least 100 generated event sequences, verify a valid final finish emits one `{ score, summary }` payload, repeated/late taps cannot emit again, and every incomplete sequence emits zero times.
    - **Validates: Requirements 1.3, 1.4**

  - [x] 5.7 Add focused phase and duplicate-tap component regressions in `src/features/lessons/components/sims/Auction.test.tsx`
    - Cover selected headline retention, required prediction, locked conflicting/double predictions, one result per round, carried prices, non-final next versus final finish, rapid duplicate next/finish taps, and no completion before the final finish.
    - _Requirements: 1.3, 1.4, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.4, 6.4_

- [x] 6. Build the live market stage and predict-then-reveal interface
  - [x] 6.1 Implement the market header, crowd, quotes, and depth in `src/features/lessons/components/sims/Auction.tsx`
    - Add private presentational sections for the fictional rare collectible, persistent “Simulation · No real money” and simulated-not-live quote labels, current price, a fixed small buyer/seller crowd, whole-number demand/supply totals, and a proportional balance meter.
    - Derive the displayed market snapshot from current price and displayed totals; update preview totals, bid/ask, and depth immediately when a headline is selected without consuming RNG.
    - Always render labelled bid/ask meanings and the compact proportional buy/sell strip; render the three expanded depth levels only when `showMarketDepth` is true, and show placeholders on a null snapshot without changing round state.
    - Keep rendering O(1) per interaction and do not create one node per demand/supply unit.
    - _Requirements: 2.1, 3.1, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.3_

  - [x] 6.2 Add focused market-stage component tests in `src/features/lessons/components/sims/Auction.test.tsx`
    - Verify initial and selected-card demand/supply, balance proportions, deterministic bid/ask updates, default expanded depth, `showMarketDepth: false` retaining quotes/compact sides, null-snapshot placeholders preserving phase, and persistent educational framing in every phase.
    - _Requirements: 2.1, 3.1, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.3_

  - [x] 6.3 Implement headline, prediction, and persistent reveal presentation in `src/features/lessons/components/sims/Auction.tsx`
    - Render all two-to-four headline cards as tap controls, retain and visually mark the active card in prediction, and render exactly the `up` and `down` commitment controls until one locks.
    - On reveal, immediately render previous and new prices, signed whole-cent difference, increase/decrease/no-change wording, actual direction, and the deterministic explanation based on demand/supply balance and computed movement rather than authored intent.
    - Keep result text persistent and expose only the correct next-round or finish control; do not delay numeric state or controls on animation timing.
    - _Requirements: 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.4_

  - [x] 6.4 Add focused interaction and reveal tests in `src/features/lessons/components/sims/Auction.test.tsx`
    - Cover two- and four-card rendering, active-card state, exact prediction choices, increase/decrease/tie signed text, imbalance and balanced-market explanations, immediate result visibility, and correct next/finish controls.
    - _Requirements: 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.4_

- [x] 7. Complete accessibility and presentation-only reveal motion
  - [x] 7.1 Implement accessible semantics, announcements, and reduced-motion animation in `src/features/lessons/components/sims/Auction.tsx`
    - Make every interaction a single-tap button with a non-empty label and selected/disabled semantics; include full headline text, explicit up/down wording, persistent accessible `Round N of M`, and exactly one active phase header for choose, predict, or reveal.
    - Keep the full result as persistent accessible text with a polite live region, and post one best-effort queued `AccessibilityInfo` announcement per reveal behind feature detection and `try/catch`.
    - Reuse `src/theme/use-reduce-motion.ts` and stable React Native `Animated.Value` instances for short native-driven opacity/transform effects only; stop effects on cleanup, snap to final presentation values for reduced motion, and never let an animation callback read RNG, change domain state, gate controls, grade, or complete.
    - Add no Reanimated, property-testing, native, network, or haptics dependency/import.
    - _Requirements: 1.8, 2.6, 6.1, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 7.2 Write the generated accessibility-semantics property test in `src/features/lessons/components/sims/Auction.test.tsx`
    - **Property 13: Every reachable UI phase preserves accessible semantics**
    - Traverse at least 100 generated valid sessions; in every reachable phase verify labelled button-only controls, headline text in labels, direction wording, `Round N of M`, one named phase header, and persistent reveal text with polite announcement semantics.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**

  - [x] 7.3 Write the generated motion-invariance property test in `src/features/lessons/components/sims/Auction.test.tsx`
    - **Property 14: Motion preference cannot change auction behavior**
    - Replay at least 100 generated sessions with reduced motion enabled and disabled, including completed and interrupted animation mocks; compare prices, signed copy, controls, history, completion count, and outcome while verifying reduced motion starts no timing animation.
    - **Validates: Requirements 2.6, 6.1, 6.3, 7.4, 7.5**

  - [x] 7.4 Add focused accessibility and animation-failure tests in `src/features/lessons/components/sims/Auction.test.tsx`
    - Mock `useReduceMotion` for static and animated paths; verify result content exists before animation completion, interrupted/missing animation clocks cannot block next/finish, and no animation completion callback mutates game state.
    - Make announcement APIs absent and throwing in separate cases and verify the persistent accessible result remains available without duplicate completion or speech attempts.
    - _Requirements: 2.6, 6.1, 6.3, 7.4, 7.5, 7.7_

- [x] 8. Wire and protect unchanged lesson integration
  - [x] 8.1 Add contract, registry, and prohibited-side-effect smoke tests in `src/features/lessons/components/sims/Auction.test.tsx`
    - Assert `Auction` remains assignable to `SimComponent`, needs no fourth prop, and `getSimComponent('auction')` from `src/features/lessons/components/sims/registry.tsx` still returns it without modifying the registry, `src/features/lessons/components/steps/SimStep.tsx`, scoring, rewind, or analytics modules.
    - Complete a component session with fetch and lesson haptic entry points configured to fail if called; verify exactly one contract-shaped completion payload and oracle-equivalent score.
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.8, 6.4_

  - [x] 8.2 Add the unchanged L1.2 compatibility regression in `src/features/lessons/sims/auction.test.ts`
    - Load the existing auction step from `content/lessons/L1.2.json` without editing it, parse its params, assert `showMarketDepth` defaults to true, and pin its established seeded price path and replay outcome for representative choices.
    - Verify the richer quote/depth derivations do not alter the legacy price path or RNG budget.
    - _Requirements: 6.3, 6.4, 9.2, 9.3_

- [x] 9. Final checkpoint - Run all non-watch verification
  - Run `npm test -- --runInBand src/features/lessons/sims/auction.test.ts src/features/lessons/components/sims/Auction.test.tsx`.
  - Run `npm run validate:content` and confirm `content/lessons/L1.2.json` remains valid and unchanged.
  - Run `npm run typecheck` and `npx expo lint` as the required repository type and Expo lint checks.
  - Repository-wide lint currently has pre-existing Jest-global failures outside this feature. If that baseline remains, record the unchanged failure output, do not weaken lint configuration or edit unrelated tests, and run targeted ESLint on `src/features/lessons/sims/auction.ts`, `src/features/lessons/sims/auction.test.ts`, `src/features/lessons/components/sims/Auction.tsx`, and `src/features/lessons/components/sims/Auction.test.tsx` to prove the touched files introduce no new lint errors.
  - Ensure all feature tests and type/content checks pass, ask the user if questions arise.

## Notes

- Implementation language is TypeScript/TSX, as established by the approved design and existing modules.
- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; they remain scheduled in the dependency graph for full verification.
- Each property task is one generated Jest test with explicit boundary fixtures, at least 100 deterministic cases driven by the existing `mulberry32`, the exact `// Feature: interactive-auction-room, Property N: ...` tag, and a replayable generation seed on failure.
- Use only existing dependencies. Do not add Reanimated, `fast-check`, another property-testing package, native modules, routes, or engine contracts.
- Keep application changes limited to `src/features/lessons/sims/auction.ts` and `src/features/lessons/components/sims/Auction.tsx`; keep tests in their existing adjacent test modules. Registry, SimStep, lesson scoring/rewind/analytics, and `content/lessons/L1.2.json` are verification targets, not modification targets.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["2.3"] },
    { "id": 6, "tasks": ["2.4"] },
    { "id": 7, "tasks": ["2.5"] },
    { "id": 8, "tasks": ["2.6"] },
    { "id": 9, "tasks": ["2.7"] },
    { "id": 10, "tasks": ["3.1"] },
    { "id": 11, "tasks": ["3.2", "5.1"] },
    { "id": 12, "tasks": ["3.3", "5.2"] },
    { "id": 13, "tasks": ["3.4", "5.3"] },
    { "id": 14, "tasks": ["3.5", "5.4"] },
    { "id": 15, "tasks": ["5.5", "8.2"] },
    { "id": 16, "tasks": ["5.6"] },
    { "id": 17, "tasks": ["5.7"] },
    { "id": 18, "tasks": ["6.1"] },
    { "id": 19, "tasks": ["6.2"] },
    { "id": 20, "tasks": ["6.3"] },
    { "id": 21, "tasks": ["6.4"] },
    { "id": 22, "tasks": ["7.1"] },
    { "id": 23, "tasks": ["7.2"] },
    { "id": 24, "tasks": ["7.3"] },
    { "id": 25, "tasks": ["7.4"] },
    { "id": 26, "tasks": ["8.1"] }
  ]
}
```

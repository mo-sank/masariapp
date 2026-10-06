# Requirements Document

## Introduction

This feature enhances the existing L1.2 "The Auction Room" hands-on lab so it feels like a mini-game inside the lesson that makes the big idea tangible: prices move when buyers and sellers disagree. Today the lab runs a plain three-phase loop per round (choose a headline, predict up or down, reveal). This enhancement adds richer, visible live-auction interactivity — a crowd of bot buyers and sellers, a visible bid/ask and order book, headline cards that shift the crowd's mood, and an animated price reaction — while preserving the predict-then-reveal learning intent that teaches supply, demand, bid, and ask.

The lab remains a registered sim that plugs into the lesson engine through the existing `SimComponentProps` contract (`{ params, seed, onComplete({ score, summary }) }`) resolved by `simId` through the `SimRegistry`. It stays pure in the lesson sense (no network, no haptics; the player owns feedback and scoring), fully deterministic from its seed, tap-only and accessible, and entirely paper/educational with a fictional "rare item" subject — no real tickers.

Scope note: this document covers the behavior of the Auction lab itself (its pure logic in `src/features/lessons/sims/auction.ts` and its component in `src/features/lessons/components/sims/Auction.tsx`). It does not change the lesson-engine contracts (`SimStep`, scoring, rewind queue, analytics) or the schema's `simId` enum; the lab continues to use the `auction` sim id.

## Glossary

- **Auction_Lab**: The L1.2 "The Auction Room" hands-on sim, comprising the pure logic module (`sims/auction.ts`) and the React component (`components/sims/Auction.tsx`). The term refers to the enhanced lab as a whole.
- **Auction_Logic**: The pure, deterministic logic module (`sims/auction.ts`) that owns params validation, the per-round price update, bid/ask and order-book derivation, and scoring. Contains no React, Expo, or network code.
- **Auction_Component**: The React Native component (`components/sims/Auction.tsx`) that renders the interactive mini-game and the predict-then-reveal loop.
- **Lesson_Engine**: The surrounding player system (`SimStep`, `LessonPlayer`, scoring, rewind queue, analytics) into which the Auction_Lab plugs via the sim contract.
- **Sim_Contract**: The shared `SimComponentProps` interface: props `{ params, seed, onComplete({ score, summary }) }`, resolved by `simId` through the `SimRegistry`.
- **Bot_Buyer**: A simulated participant willing to buy the item, contributing to demand.
- **Bot_Seller**: A simulated participant willing to sell the item, contributing to supply.
- **Headline_Card**: An authored card the learner plays each round that shifts bot demand and/or supply by additive deltas, nudging the crowd's mood.
- **Bid**: The highest price buyers are currently willing to pay in a round.
- **Ask**: The lowest price sellers are currently willing to accept in a round.
- **Spread**: The difference between the Ask and the Bid.
- **Order_Book**: The round's visible snapshot of resting buy demand and sell supply, including Bid, Ask, and the relative size of each side.
- **Round**: One cycle of the mini-game: choose a Headline_Card, predict price direction, then reveal the price reaction.
- **Price_Direction**: The direction the price moved in a round, one of `up` or `down`. A revealed price change greater than zero resolves to `up`, less than zero resolves to `down`, and a change of exactly zero (no change) resolves to a single deterministic direction (`up`).
- **Seed**: The stable 32-bit integer the Lesson_Engine derives from the step id and passes to the Auction_Lab, from which all lab randomness is drawn.
- **Final_Score**: The lab's self-graded 0-100 integer reported to the player, equal to the share of rounds the learner predicted correctly.

## Requirements

### Requirement 1: Preserve the sim contract and engine integration

**User Story:** As a lesson-engine maintainer, I want the enhanced Auction_Lab to keep using the existing sim contract, so that the lab plugs into the player, scoring, and analytics without engine changes.

#### Acceptance Criteria

1. THE Auction_Component SHALL accept exactly three props as defined by the Sim_Contract: `params`, `seed`, and `onComplete`, and SHALL require no additional props to render.
2. THE Auction_Lab SHALL remain registered under the `auction` sim id in the SimRegistry.
3. WHEN the learner completes the final Round of the session, THE Auction_Component SHALL call `onComplete` exactly once, passing both a `score` and a `summary`.
4. WHILE any Round of the session is incomplete, THE Auction_Component SHALL NOT call `onComplete`.
5. THE Auction_Component SHALL report the Final_Score as an integer between 0 and 100 inclusive, clamping any computed value outside that range to the nearest bound.
6. IF the Auction_Component receives missing or invalid `params` or `seed`, THEN THE Auction_Component SHALL render a non-blocking error state and SHALL NOT call `onComplete`.
7. THE Auction_Lab SHALL NOT perform network requests.
8. THE Auction_Lab SHALL NOT trigger haptics or render feedback that the Lesson_Engine owns.

### Requirement 2: Richer live-auction interactivity

**User Story:** As a learner, I want to watch a live crowd of bot buyers and sellers react to my headline, so that I can see how disagreement between buyers and sellers moves the price.

#### Acceptance Criteria

1. WHILE a Round is in progress, THE Auction_Component SHALL display the current total demand from Bot_Buyers as a whole number from 0 to 1,000,000 and the current total supply from Bot_Sellers as a whole number from 0 to 1,000,000, updating the displayed values within 500 milliseconds of any change to demand or supply.
2. WHEN the learner plays a Headline_Card, THE Auction_Logic SHALL adjust total bot demand and total bot supply by that card's authored demand delta and supply delta (each delta an integer from -1,000,000 to 1,000,000), flooring each resulting total at zero.
3. WHEN a Headline_Card is applied, THE Auction_Logic SHALL compute the new price using the imbalance update `price' = price * (1 + k * (demand - supply) / (demand + supply)) + noise`, where `k` is the authored sensitivity (a value from 0.0 to 1.0) and `noise` is a seeded pseudo-random value derived deterministically from the Round seed, bounded by the authored noise fraction of the price.
4. IF total demand plus total supply equals zero in a Round, THEN THE Auction_Logic SHALL treat the imbalance term `(demand - supply) / (demand + supply)` as zero so that no division by zero occurs.
5. WHEN the Auction_Logic computes a price, THE Auction_Logic SHALL round the result to the nearest whole cent and floor it at 1 cent so that the stored price is a positive integer.
6. WHEN a Round's result is revealed, THE Auction_Component SHALL display the price change as the signed difference in whole cents between the price before the Round and the price after the Round, indicating direction (increase, decrease, or no change) within 500 milliseconds of the reveal.

### Requirement 3: Visible bid, ask, and order book

**User Story:** As a learner, I want to see the bid, the ask, and the two sides of the order book, so that I understand what bid and ask mean and how price discovery works.

#### Acceptance Criteria

1. WHILE a Round is in progress, THE Auction_Component SHALL display the current Bid and the current Ask within 500 milliseconds of any change to the Round's price or demand-and-supply balance.
2. WHEN the Auction_Logic is given the same current price and the same demand-and-supply balance, THE Auction_Logic SHALL derive an identical Bid and an identical Ask on every computation.
3. THE Auction_Logic SHALL compute the Ask as greater than or equal to the Bid so that the Spread is greater than or equal to zero.
4. WHILE a Round is in progress, THE Auction_Component SHALL display the Order_Book showing the relative size of resting buy demand and resting sell supply in proportion to the current demand and supply.
5. IF the current price or the demand-and-supply balance for a Round is unavailable, THEN THE Auction_Component SHALL display a placeholder for the Bid, the Ask, and the Order_Book and SHALL preserve the Round state.
6. WHERE the authored params enable the bid/ask display, THE Auction_Component SHALL label the displayed Bid and Ask with their meaning.

### Requirement 4: The learner's active role and predict-then-reveal loop

**User Story:** As a learner, I want to pick a headline and commit a prediction before seeing the result, so that I actively reason about price direction rather than passively watching.

#### Acceptance Criteria

1. WHEN a Round begins, THE Auction_Component SHALL present between 2 and 4 Headline_Cards for the learner to choose from.
2. WHEN the learner selects a Headline_Card, THE Auction_Component SHALL advance to the prediction phase for that Round and visually indicate the selected Headline_Card as active.
3. WHILE in the prediction phase, THE Auction_Component SHALL require the learner to predict a Price_Direction of exactly one of up or down before revealing the result.
4. WHEN the learner commits a prediction, THE Auction_Component SHALL lock that prediction so it cannot be changed for the current Round, and then reveal the Round's price reaction.
5. IF the learner attempts to change a prediction after it is locked for the current Round, THEN THE Auction_Component SHALL reject the change and retain the originally locked Price_Direction.
6. WHEN a Round's result is revealed on any Round other than the last Round, THE Auction_Component SHALL present a control to advance to the next Round.
7. WHEN a Round's result is revealed on the last Round, THE Auction_Component SHALL present a control to finish the lab.
8. WHEN a Round's result is revealed, THE Auction_Component SHALL derive the revealed Price_Direction from the actual computed price change rather than from the Headline_Card's authored intent, resolving a change of greater than zero to up, a change of less than zero to down, and a change of zero to a single deterministic direction.

### Requirement 5: Scoring and outcome reporting

**User Story:** As a learner, I want a clear score and summary at the end, so that I know how well I read the market.

#### Acceptance Criteria

1. WHEN a Round's revealed Price_Direction is identical to the learner's committed prediction for that Round, THE Auction_Logic SHALL count that Round as correct.
2. IF a Round ends with no committed prediction from the learner, THEN THE Auction_Logic SHALL count that Round as not correct.
3. WHEN the lab finishes, THE Auction_Logic SHALL compute the Final_Score as the count of correct Rounds divided by the total number of Rounds, multiplied by 100 and rounded to the nearest integer, producing an integer between 0 and 100 inclusive.
4. WHEN the lab finishes, THE Auction_Component SHALL report a summary that states the count of correctly predicted Rounds out of the total number of Rounds.
5. IF the total number of Rounds is zero, THEN THE Auction_Logic SHALL report a Final_Score of zero.

### Requirement 6: Determinism from the seed

**User Story:** As a lesson-engine maintainer, I want the lab to be fully deterministic from its seed, so that the same seed and the same choices always produce the same price path, verified by pure-logic tests.

#### Acceptance Criteria

1. THE Auction_Lab SHALL draw all randomness exclusively from the Seed passed through the Sim_Contract, with no other entropy source influencing any Round price or Final_Score.
2. THE Auction_Lab SHALL NOT read the system clock, call `Math.random`, or consume any ambient entropy source outside the Seed.
3. WHEN the Auction_Logic replays the same params, the same Seed, and the same sequence of learner choices, THE Auction_Logic SHALL produce an identical sequence of per-Round prices, an identical correct count, and an identical Final_Score across repeated runs.
4. WHEN the Auction_Component advances through a Round, THE Auction_Component SHALL advance its seeded random source exactly one time per Round, such that the live loop's per-Round prices, correct count, and Final_Score equal those produced by the Auction_Logic replay oracle for the same Seed and choice sequence.

### Requirement 7: Accessibility

**User Story:** As a learner using assistive technology, I want tap-only labelled controls and spoken result announcements, so that I can play the auction mini-game without gestures or sight of the screen.

#### Acceptance Criteria

1. THE Auction_Component SHALL expose all interactive controls as buttons with a non-empty accessible label, each operable by a single tap and requiring no drag, swipe, long-press, or multi-touch gesture.
2. THE Auction_Component SHALL provide a non-empty accessible label for each Headline_Card that includes the headline text the learner is playing.
3. THE Auction_Component SHALL provide an accessible label for each Price_Direction choice describing the predicted direction.
4. WHEN a Round's result is revealed, THE Auction_Component SHALL announce the price reaction through a polite accessibility live region.
5. IF the live-region announcement cannot be posted, THEN THE Auction_Component SHALL present the price reaction as persistent on-screen accessible text.
6. THE Auction_Component SHALL present the current Round number and the total number of Rounds as accessible text in the form "Round N of M".
7. WHEN a Round transitions between phases, THE Auction_Component SHALL mark the active phase with an accessible header that names the phase.

### Requirement 8: Paper/educational framing

**User Story:** As a learner, I want the auction to be clearly a fictional simulation with no real money, so that I understand this is practice and not financial advice.

#### Acceptance Criteria

1. THE Auction_Lab SHALL use a fictional rare-item subject and SHALL NOT reference real tickers or real securities.
2. WHILE the auction is displayed, THE Auction_Component SHALL present at least one persistent, continuously visible label that identifies the auction as a simulation using no real money.
3. WHERE delayed-quote framing is relevant to the displayed price, THE Auction_Component SHALL display a visible indicator stating that prices shown are simulated and not live market quotes.

### Requirement 9: Params validation and backward compatibility

**User Story:** As a content author, I want the lab to validate its params and keep working with existing authored auction steps, so that adding richer interactivity does not break current content.

#### Acceptance Criteria

1. WHEN the Auction_Component mounts, THE Auction_Logic SHALL validate the authored `params` against its schema and SHALL raise a validation error if the shape is invalid.
2. THE Auction_Logic SHALL accept the existing auction params fields: `startPriceCents`, `baseDemand`, `baseSupply`, `sensitivity`, `noise`, `headlines`, and `rounds`.
3. WHERE a newly added params field is absent in authored content, THE Auction_Logic SHALL apply a documented default so that existing auction steps remain valid.
4. IF a Headline_Card referenced by a learner choice does not exist in the authored `params.headlines`, THEN THE Auction_Logic SHALL raise an error identifying the unknown Headline_Card.

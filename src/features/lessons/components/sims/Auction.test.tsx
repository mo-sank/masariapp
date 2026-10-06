import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { Auction } from './Auction';
import { getSimComponent, SIM_REGISTRY } from './registry';
import type { SimComponent } from './types';
import { ThemeProvider } from '../../../../theme/theme-provider';
import { useReduceMotion } from '../../../../theme/use-reduce-motion';
import * as hapticsModule from '../../haptics';
import * as rngModule from '../../rng';
import { mulberry32, randomInt, type Rng } from '../../rng';
import {
  deriveCrowdTotals,
  deriveMarketSnapshot,
  parseAuctionParams,
  scoreAuction,
  type AuctionChoice,
} from '../../sims/auction';
import { formatDollars } from '../../sims/ownership-split';

// Task 8.1 prohibited-side-effect guard (requirement 1.8): the auction lab must
// perform no haptics. The lab imports no haptics module at all, so this mock is
// a belt-and-braces trip wire — if any code the lab reaches ever imports
// `expo-haptics`, every entry point throws, failing the "no haptics" smoke test
// instead of silently buzzing. No other block in this file touches haptics.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => {
    throw new Error('expo-haptics must not be called from the auction lab');
  }),
  notificationAsync: jest.fn(() => {
    throw new Error('expo-haptics must not be called from the auction lab');
  }),
  selectionAsync: jest.fn(() => {
    throw new Error('expo-haptics must not be called from the auction lab');
  }),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Task 8.1 contract assignability (requirements 1.1, 1.2): the public `Auction`
// component must remain a drop-in `SimComponent` — a React component whose only
// props are the shared `SimComponentProps` ({ params, seed, onComplete }). This
// module-scope assignment compiles only while that stays true; a fourth required
// prop or a diverging props shape would be a type error here under `tsc`.
const _auctionIsSimComponent: SimComponent = Auction;
void _auctionIsSimComponent;

// Property 14 mocks `useReduceMotion` so a session can be replayed with reduced
// motion on and off. The mock is hoisted and global, so it must default to the
// SAME value the real hook starts at — `false` (motion allowed) — so every other
// describe block in this file renders exactly as it would with the real hook's
// initial state. Property 14 toggles `mockReturnValue` per run and resets it in
// its own afterEach; no other block ever changes it.
jest.mock('../../../../theme/use-reduce-motion', () => ({
  useReduceMotion: jest.fn(() => false),
}));

/** The mocked hook, typed so Property 14 can drive its per-run return value. */
const mockUseReduceMotion = useReduceMotion as unknown as jest.Mock<boolean, []>;

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * A two-round auction with an unambiguous bull and bear card. Noise is zero so
 * the headline alone decides direction and the component path is easy to assert.
 */
const PARAMS = {
  startPriceCents: 10000,
  baseDemand: 50,
  baseSupply: 50,
  sensitivity: 0.2,
  noise: 0,
  rounds: 2,
  headlines: [
    { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
    { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
  ],
};

/**
 * Play one round: choose a headline, predict, then continue. Awaits each phase
 * transition so act() scopes never overlap (React 19) and the next tap acts on
 * the re-rendered phase.
 */
async function playRound(headlineText: string, prediction: 'up' | 'down', last: boolean) {
  fireEvent.press(screen.getByRole('button', { name: `Play headline: ${headlineText}` }));
  // The prediction buttons appear once the headline is chosen.
  const predictLabel =
    prediction === 'up' ? 'Predict the price will go up' : 'Predict the price will go down';
  fireEvent.press(await screen.findByRole('button', { name: predictLabel }));
  // The result and the continue/finish button appear once a prediction is in.
  const continueLabel = last ? 'See your result' : 'Go to the next round';
  fireEvent.press(await screen.findByRole('button', { name: continueLabel }));
}

describe('<Auction /> (requirements 8.2, 8.5)', () => {
  it('shows the round, price, and headline cards up front', async () => {
    await renderWithTheme(<Auction params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(screen.getByText('$100')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Great earnings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Factory fire' })).toBeTruthy();
  });

  it('requires a prediction before revealing the result (8.2)', async () => {
    await renderWithTheme(<Auction params={PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    // Prediction buttons are shown; the result is not revealed yet.
    expect(
      await screen.findByRole('button', { name: 'Predict the price will go up' }),
    ).toBeTruthy();
    expect(screen.queryByText(/The price moved/)).toBeNull();
  });

  it('reveals the actual direction after a prediction', async () => {
    await renderWithTheme(<Auction params={PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Predict the price will go up' }));
    expect(await screen.findByText(/The price moved up/)).toBeTruthy();
  });

  it('reports score = correct predictions / rounds, matching the pure oracle (8.5)', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<Auction params={PARAMS} seed={42} onComplete={onComplete} />);

    // Round 1: bull card, predict up (correct). Round 2: bear card, predict up
    // (wrong — price falls). So 1 of 2 correct -> score 50.
    await playRound('Great earnings', 'up', false);
    // Wait for round 2 to render before playing it.
    await screen.findByText('Round 2 of 2');
    await playRound('Factory fire', 'up', true);

    // Cross-check against the pure oracle fed the same seed the component uses
    // (the raw `seed` prop, 42 here).
    const choices: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'up' },
    ];
    // Parse the raw fixture into fully-defaulted AuctionParams before feeding
    // the pure oracle: scoreAuction takes the parsed type (which now requires
    // showMarketDepth), while the component accepts the raw literal and parses
    // it internally.
    const oracle = scoreAuction(parseAuctionParams(PARAMS), choices, mulberry32(42));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: oracle.score }));
    expect(oracle.score).toBe(50);
  });
});

// Feature: interactive-auction-room, Property 2: Invalid input remains an inert error state
//
// For all invalid component inputs — a valid base params object with exactly one
// field mutated out of contract, or valid params paired with a seed outside the
// finite uint32 range — the public `Auction` boundary renders the stable,
// non-crashing error copy and nothing else: no headline cards, no up/down
// prediction controls, no round counter, and it never calls `onComplete`. When
// the invalid input is a params mutation (seed valid), the strict
// `parseAuctionParams` must also throw for that exact params object, proving the
// component boundary and the strict parser agree on what is invalid.
//
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check). The generation seed is included in every failure message
// so a failing case can be replayed by seeding `mulberry32` with it.
describe('<Auction /> — Property 2: invalid input remains an inert error state (requirements 1.6, 9.1)', () => {
  const ERROR_COPY = 'This market lab could not load.';
  const MAX_CROWD = 1_000_000;
  const MAX_DELTA = 1_000_000;
  const MAX_SEED = 4_294_967_295;

  /** A valid, fully-authored base params object built from the seeded RNG. */
  function generateValidParams(rng: Rng): Record<string, unknown> {
    const headlineCount = randomInt(rng, 2, 4);
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => ({
      id: `h${i}`,
      text: `Headline ${i}`,
      demandDelta: randomInt(rng, -MAX_DELTA, MAX_DELTA),
      supplyDelta: randomInt(rng, -MAX_DELTA, MAX_DELTA),
    }));
    return {
      startPriceCents: randomInt(rng, 1, 1_000_000_000),
      baseDemand: randomInt(rng, 0, MAX_CROWD),
      baseSupply: randomInt(rng, 0, MAX_CROWD),
      sensitivity: rng(),
      noise: rng() * 0.1,
      rounds: randomInt(rng, 1, 20),
      showMarketDepth: rng() < 0.5,
      headlines,
    };
  }

  /** A valid uint32 seed built from the seeded RNG. */
  function generateValidSeed(rng: Rng): number {
    return randomInt(rng, 0, MAX_SEED);
  }

  /**
   * One generated case: the raw `params`/`seed` to hand the component, a label
   * for failure replay, and `paramsInvalid` — true when the invalidity lives in
   * `params` (so the strict parser must also throw for `params`), false when the
   * params are valid and only the seed is out of contract.
   */
  interface GeneratedCase {
    params: unknown;
    seed: unknown;
    label: string;
    paramsInvalid: boolean;
  }

  /**
   * Mutate exactly one field of a valid base params object to an out-of-contract
   * value, leaving everything else valid. The seed stays a valid uint32, so the
   * only reason the component rejects the input is the mutated field — which the
   * strict `parseAuctionParams` must reject too.
   */
  function generateInvalidParamsCase(rng: Rng, label: string): GeneratedCase {
    const base = generateValidParams(rng);
    const seed = generateValidSeed(rng);
    const mutators: { name: string; apply: (p: Record<string, unknown>) => void }[] = [
      { name: 'startPriceCents=0', apply: (p) => (p.startPriceCents = 0) },
      { name: 'startPriceCents=-5', apply: (p) => (p.startPriceCents = -5) },
      { name: 'startPriceCents=fraction', apply: (p) => (p.startPriceCents = 100.5) },
      { name: 'rounds=-1', apply: (p) => (p.rounds = -1) },
      { name: 'rounds=0', apply: (p) => (p.rounds = 0) },
      { name: 'baseDemand=-1', apply: (p) => (p.baseDemand = -1) },
      { name: 'baseSupply=overflow', apply: (p) => (p.baseSupply = MAX_CROWD + 1) },
      { name: 'sensitivity=1.5', apply: (p) => (p.sensitivity = 1.5) },
      { name: 'sensitivity=NaN', apply: (p) => (p.sensitivity = Number.NaN) },
      { name: 'noise=0.5', apply: (p) => (p.noise = 0.5) },
      {
        name: 'showMarketDepth=non-boolean',
        apply: (p) => (p.showMarketDepth = 'yes'),
      },
      {
        name: 'duplicate-headline-ids',
        apply: (p) => {
          const hs = p.headlines as { id: string }[];
          hs[1] = { ...hs[1], id: hs[0].id };
        },
      },
      {
        name: 'one-headline',
        apply: (p) => {
          p.headlines = [(p.headlines as unknown[])[0]];
        },
      },
      {
        name: 'five-headlines',
        apply: (p) => {
          const h = (p.headlines as unknown[])[0];
          p.headlines = Array.from({ length: 5 }, (_u, i) => ({
            id: `d${i}`,
            text: `Dup ${i}`,
            demandDelta: 0,
            supplyDelta: 0,
          }));
          void h;
        },
      },
      {
        name: 'headline-delta-out-of-range',
        apply: (p) => {
          const hs = p.headlines as Record<string, unknown>[];
          hs[0] = { ...hs[0], demandDelta: MAX_DELTA + 1 };
        },
      },
    ];
    const mutator = mutators[randomInt(rng, 0, mutators.length - 1)];
    mutator.apply(base);
    return { params: base, seed, label: `${label}:params:${mutator.name}`, paramsInvalid: true };
  }

  /**
   * Pair valid params with a seed from an invalid category: a string, a
   * fraction, a negative, an above-uint32 overflow, `NaN`, or an infinity. The
   * runtime `isValidAuctionSeed` guard must reject each without coercion.
   */
  function generateInvalidSeedCase(rng: Rng, label: string): GeneratedCase {
    const params = generateValidParams(rng);
    const seedKinds: { name: string; make: () => unknown }[] = [
      { name: 'string', make: () => '123' },
      { name: 'fraction', make: () => randomInt(rng, 0, MAX_SEED) + 0.5 },
      { name: 'negative', make: () => -randomInt(rng, 1, MAX_SEED) },
      { name: 'overflow', make: () => MAX_SEED + randomInt(rng, 1, 1000) },
      { name: 'NaN', make: () => Number.NaN },
      { name: 'Infinity', make: () => Number.POSITIVE_INFINITY },
      { name: '-Infinity', make: () => Number.NEGATIVE_INFINITY },
    ];
    const kind = seedKinds[randomInt(rng, 0, seedKinds.length - 1)];
    return {
      params,
      seed: kind.make(),
      label: `${label}:seed:${kind.name}`,
      paramsInvalid: false,
    };
  }

  /**
   * Assert the component boundary stays inert for one invalid case: the stable
   * error copy is shown, no game control or round counter is rendered, and
   * `onComplete` is never called. When the params are what's invalid, the strict
   * parser must also throw for the same params object.
   */
  async function checkCase(testCase: GeneratedCase): Promise<void> {
    const { params, seed, label, paramsInvalid } = testCase;

    // Consistency between the strict parser and the component boundary: an
    // invalid-params case must also make parseAuctionParams throw.
    if (paramsInvalid) {
      expect(() => parseAuctionParams(params)).toThrow();
    }

    const onComplete = jest.fn();
    // Await the render and query against its own result object. The `screen`
    // singleton only tracks a single live render and is reset by `cleanup`, so
    // using the per-render queries keeps each of the 100+ loop iterations
    // isolated.
    const view = await render(
      <ThemeProvider>
        <Auction params={params} seed={seed as number} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      // The stable, non-crashing error copy is present.
      expect(view.getByText(ERROR_COPY)).toBeTruthy();

      // No game controls or round counter exist in the error state.
      expect(view.queryByText(/^Round \d+ of \d+$/)).toBeNull();
      expect(view.queryAllByRole('button', { name: /^Play headline:/ })).toHaveLength(0);
      expect(view.queryByRole('button', { name: 'Predict the price will go up' })).toBeNull();
      expect(view.queryByRole('button', { name: 'Predict the price will go down' })).toBeNull();

      // The inert error state never completes the step.
      expect(onComplete).not.toHaveBeenCalled();
    } catch (error) {
      throw new Error(`case ${label} failed its inert-error assertions: ${String(error)}`);
    } finally {
      // Unmount between cases so each render asserts against a fresh tree.
      view.unmount();
    }
  }

  // Explicit boundary fixtures pinning each invalid corner. Driven through
  // `it.each` (one render per Jest case) rather than a manual loop, because
  // repeated mount/unmount cycles inside a single test share one React root and
  // interfere; a fresh test per case gives each render a clean lifecycle.
  const validHeadlines = [
    { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
    { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
  ];
  const validParams = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: validHeadlines,
  };

  const fixtures: GeneratedCase[] = [
      // Params mutations — strict parser must also reject each.
      {
        params: { ...validParams, startPriceCents: 0 },
        seed: 1,
        label: 'fixture:startPriceCents-zero',
        paramsInvalid: true,
      },
      {
        params: { ...validParams, rounds: -1 },
        seed: 1,
        label: 'fixture:rounds-negative',
        paramsInvalid: true,
      },
      {
        params: {
          ...validParams,
          headlines: [validHeadlines[0], { ...validHeadlines[1], id: 'bull' }],
        },
        seed: 1,
        label: 'fixture:duplicate-headline-ids',
        paramsInvalid: true,
      },
      {
        params: { ...validParams, headlines: [validHeadlines[0]] },
        seed: 1,
        label: 'fixture:one-headline',
        paramsInvalid: true,
      },
      {
        params: {
          ...validParams,
          headlines: Array.from({ length: 5 }, (_u, i) => ({
            id: `h${i}`,
            text: `H${i}`,
            demandDelta: 0,
            supplyDelta: 0,
          })),
        },
        seed: 1,
        label: 'fixture:five-headlines',
        paramsInvalid: true,
      },
      {
        params: {
          ...validParams,
          headlines: [{ ...validHeadlines[0], demandDelta: MAX_DELTA + 1 }, validHeadlines[1]],
        },
        seed: 1,
        label: 'fixture:delta-out-of-range',
        paramsInvalid: true,
      },
      {
        params: { ...validParams, showMarketDepth: 'yes' },
        seed: 1,
        label: 'fixture:showMarketDepth-non-boolean',
        paramsInvalid: true,
      },
      // Invalid seed categories with valid params.
      { params: validParams, seed: 'abc', label: 'fixture:seed-string', paramsInvalid: false },
      { params: validParams, seed: 1.5, label: 'fixture:seed-fraction', paramsInvalid: false },
      { params: validParams, seed: -1, label: 'fixture:seed-negative', paramsInvalid: false },
      {
        params: validParams,
        seed: MAX_SEED + 1,
        label: 'fixture:seed-overflow',
        paramsInvalid: false,
      },
      {
        params: validParams,
        seed: Number.NaN,
        label: 'fixture:seed-nan',
        paramsInvalid: false,
      },
      {
        params: validParams,
        seed: Number.POSITIVE_INFINITY,
        label: 'fixture:seed-infinity',
        paramsInvalid: false,
      },
  ];

  // One top-level generation seed drives every generated case, so a failing run
  // is fully reproducible from this number alone; each case's label also carries
  // its own derived seed for isolated replay.
  const GENERATION_SEED = 0x2b2c0f5;
  const GENERATED_CASES = 120;

  const generatedCases: GeneratedCase[] = (() => {
    const seedRng = mulberry32(GENERATION_SEED);
    const cases: GeneratedCase[] = [];
    for (let i = 0; i < GENERATED_CASES; i++) {
      const caseSeed = randomInt(seedRng, 0, 0xffffffff);
      const rng = mulberry32(caseSeed);
      const label = `seed=${GENERATION_SEED} case#${i} caseSeed=${caseSeed}`;
      // Alternate between the two invalid-input families so both single-field
      // params mutations and invalid seed categories are exercised across the
      // 100+ cases.
      cases.push(
        i % 2 === 0
          ? generateInvalidParamsCase(rng, label)
          : generateInvalidSeedCase(rng, label),
      );
    }
    return cases;
  })();

  it.each(fixtures.map((c) => [c.label, c] as const))(
    'keeps explicit boundary fixture %s inert without completing',
    async (_label, testCase) => {
      await checkCase(testCase);
    },
  );

  it.each(generatedCases.map((c) => [c.label, c] as const))(
    'keeps generated invalid input inert: %s',
    async (_label, testCase) => {
      await checkCase(testCase);
    },
  );
});

// Feature: interactive-auction-room, Property 10: The interaction machine locks selection and prediction
//
// Drive the live `choose -> predict -> reveal -> completed` machine with
// randomized event streams and assert its locking invariants through the
// observable UI alone (never reaching into component internals):
//
//  - Reveal requires exactly one known headline AND one committed direction.
//    The result text (`/The price moved/`) and the next/finish control appear
//    only after a legal `choose` then a legal `up`/`down` commit — never from an
//    early commit while still in `choose`, nor from a `next` tap while still in
//    `predict` (those controls are simply not rendered in the wrong phase).
//  - A reveal creates at most one round record: exactly one "The price moved"
//    line is on screen and the round counter advanced by exactly one versus the
//    round shown before the commit.
//  - Locked values are retained: once a direction is committed the up/down pair
//    disappears, so a conflicting second commit cannot change the revealed
//    result. We fire the found prediction button twice before re-query to prove
//    the double-tap is a no-op (one result, round advanced once).
//  - `onComplete` is NEVER called until a valid final finish. Every sequence
//    that stops short of pressing "See your result" on the last round leaves
//    `onComplete` uncalled; only the legal final finish emits exactly once.
//
// Sequences mix legal taps, duplicate taps (same headline twice, commit twice,
// next twice), early/invalid events (commit while in `choose`, next while in
// `predict`), and conflicting events (a second headline after one is selected, a
// second opposite commit after a commit). Cases are generated dependency-free
// with the existing `mulberry32`/`randomInt` RNG (no fast-check); the generation
// seed and per-case seed are included in every failure message for replay.
describe('<Auction /> — Property 10: the interaction machine locks selection and prediction (requirements 1.4, 4.3, 4.4, 4.5)', () => {
  // Noise is zero so direction is decided by the headline alone, but Property 10
  // only cares about the machine's locking behavior, not the specific direction.
  // Two unambiguous cards keep "a second, different headline" always available.
  const P10_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 3,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';
  const RESULT_PATTERN = /The price moved/;
  const ROUND_PATTERN = /^Round (\d+) of (\d+)$/;

  /** The kinds of events a generated sequence can request. */
  type P10EventKind =
    | 'selectKnown' // tap a (possibly already-selected) known headline
    | 'selectSecond' // tap a different known headline than the active one
    | 'duplicateSelect' // tap the same headline twice back to back
    | 'commitUp' // commit the up prediction
    | 'commitDown' // commit the down prediction
    | 'duplicateCommit' // commit, then immediately commit again (double tap)
    | 'conflictingCommit' // commit, then immediately commit the opposite direction
    | 'next' // advance to the next round
    | 'duplicateNext' // tap next twice back to back
    | 'finish' // finish the lab
    | 'earlyCommit' // attempt a commit while still in `choose`
    | 'earlyNext'; // attempt a next while still in `predict`

  // This project's `render` resolves asynchronously, so the usable render
  // object is the awaited result, not the returned promise.
  type RenderResult = Awaited<ReturnType<typeof render>>;

  /** Read the current `Round N of M` as a 1-based pair, or null if absent. */
  function readRound(view: RenderResult): { n: number; m: number } | null {
    const node = view.queryByText(ROUND_PATTERN);
    if (!node) return null;
    const text = Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children);
    const match = ROUND_PATTERN.exec(text);
    if (!match) return null;
    return { n: Number(match[1]), m: Number(match[2]) };
  }

  /** How many revealed "The price moved" lines are currently rendered. */
  function countResults(view: RenderResult): number {
    return view.queryAllByText(RESULT_PATTERN).length;
  }

  /** The current phase inferred purely from which controls are rendered. */
  function currentPhase(view: RenderResult): 'choose' | 'predict' | 'reveal' | 'completed' {
    if (view.queryByText(RESULT_PATTERN)) return 'reveal';
    if (view.queryByRole('button', { name: UP_LABEL })) return 'predict';
    if (view.queryAllByRole('button', { name: /^Play headline:/ }).length > 0) return 'choose';
    return 'completed';
  }

  /**
   * Apply one requested event to the live component and assert the machine's
   * local invariants hold afterwards. Returns nothing; it only drives + checks.
   * Each branch guards on the actually-rendered controls (queryByRole) so an
   * event aimed at the wrong phase is proven to be a no-op either because its
   * control is absent or because firing it changes nothing observable.
   */
  async function applyEvent(
    view: RenderResult,
    kind: P10EventKind,
    onComplete: jest.Mock,
  ): Promise<void> {
    switch (kind) {
      case 'selectKnown':
      case 'duplicateSelect': {
        // Only legal in `choose`; the headline buttons only exist there.
        const buttons = view.queryAllByRole('button', { name: /^Play headline:/ });
        if (buttons.length === 0) return;
        const roundBefore = readRound(view);
        fireEvent.press(buttons[0]);
        // Selecting a headline reveals the prediction controls and reveals NO
        // result and does not advance the round counter.
        expect(await view.findByRole('button', { name: UP_LABEL })).toBeTruthy();
        if (kind === 'duplicateSelect') {
          // The headline cards are gone in `predict`; a stale second tap on the
          // already-captured node must not re-fire selection or advance the
          // round — the phase guard rejects it. (Fire after the first press has
          // settled to avoid overlapping act() scopes.)
          fireEvent.press(buttons[0]);
          expect(view.queryByRole('button', { name: UP_LABEL })).toBeTruthy();
        }
        expect(countResults(view)).toBe(0);
        expect(readRound(view)).toEqual(roundBefore);
        return;
      }
      case 'selectSecond': {
        // A second, different headline after one is already selected: the cards
        // are gone in `predict`, so this is a no-op there. In `choose` it just
        // picks the other card. Either way: no result, round unchanged.
        const phase = currentPhase(view);
        const roundBefore = readRound(view);
        if (phase === 'choose') {
          const buttons = view.queryAllByRole('button', { name: /^Play headline:/ });
          fireEvent.press(buttons[buttons.length - 1]);
          expect(await view.findByRole('button', { name: UP_LABEL })).toBeTruthy();
        } else if (phase === 'predict') {
          // No headline cards exist to tap; prove it, then confirm still predict.
          expect(view.queryAllByRole('button', { name: /^Play headline:/ })).toHaveLength(0);
          expect(view.queryByRole('button', { name: UP_LABEL })).toBeTruthy();
        }
        expect(countResults(view)).toBe(phase === 'reveal' ? 1 : 0);
        expect(readRound(view)).toEqual(roundBefore);
        return;
      }
      case 'commitUp':
      case 'commitDown': {
        const label = kind === 'commitUp' ? UP_LABEL : DOWN_LABEL;
        const button = view.queryByRole('button', { name: label });
        if (!button) return; // Not in `predict`; the control is absent.
        const roundBefore = readRound(view);
        fireEvent.press(button);
        // A legal commit reveals exactly one result and locks the prediction
        // (the up/down pair is gone). The reveal stays on the same round — the
        // counter only advances when NEXT moves to the next round.
        expect(await view.findByText(RESULT_PATTERN)).toBeTruthy();
        expect(countResults(view)).toBe(1);
        expect(readRound(view)?.n).toBe(roundBefore?.n);
        expect(view.queryByRole('button', { name: UP_LABEL })).toBeNull();
        expect(view.queryByRole('button', { name: DOWN_LABEL })).toBeNull();
        return;
      }
      case 'duplicateCommit': {
        const button = view.queryByRole('button', { name: UP_LABEL });
        if (!button) return;
        const roundBefore = readRound(view);
        // Fire the SAME found button twice. The second tap lands after the
        // machine has already moved to `reveal`, so it must be a no-op: still
        // exactly one result and the round counter unchanged. We settle the
        // first commit before the stale second tap so the two taps do not open
        // overlapping act() scopes; the component still rejects the second tap
        // via its already-advanced phase guard.
        fireEvent.press(button);
        expect(await view.findByText(RESULT_PATTERN)).toBeTruthy();
        fireEvent.press(button); // stale double tap on the captured node
        expect(countResults(view)).toBe(1);
        expect(readRound(view)?.n).toBe(roundBefore?.n);
        return;
      }
      case 'conflictingCommit': {
        const upButton = view.queryByRole('button', { name: UP_LABEL });
        const downButton = view.queryByRole('button', { name: DOWN_LABEL });
        if (!upButton || !downButton) return;
        const roundBefore = readRound(view);
        // Both buttons were rendered during `predict`. Commit the first and let
        // the reveal settle, then fire the opposite-direction button on its
        // already-captured node: that conflicting/stale tap must be rejected by
        // the already-advanced phase guard and must not change the revealed
        // result. (Settling before the second tap avoids overlapping act()
        // scopes while still exercising the lock — the second tap now genuinely
        // lands after the machine has left `predict`.)
        fireEvent.press(upButton);
        await view.findByText(RESULT_PATTERN);
        fireEvent.press(downButton); // conflicting, stale second commit
        // The conflicting second commit was rejected by the already-advanced
        // phase guard: there is still exactly one revealed result and the round
        // counter is unchanged (reveal stays on the committed round). A second
        // accepted commit would have produced a second result line.
        expect(countResults(view)).toBe(1);
        expect(readRound(view)?.n).toBe(roundBefore?.n);
        return;
      }
      case 'next':
      case 'duplicateNext': {
        const button = view.queryByRole('button', { name: NEXT_LABEL });
        if (!button) return; // Only rendered on a non-final reveal.
        const roundBefore = readRound(view);
        fireEvent.press(button);
        // Advancing clears the result and moves to the next `choose` phase; the
        // round counter increments by exactly one.
        expect(
          (await view.findAllByRole('button', { name: /^Play headline:/ })).length,
        ).toBeGreaterThan(0);
        if (kind === 'duplicateNext') {
          // The reveal (and its NEXT button) is gone after advancing; a stale
          // second tap on the already-captured node must not skip a round. Fire
          // it after the advance has settled so the two taps do not overlap
          // act() scopes; the phase guard rejects it.
          fireEvent.press(button);
        }
        expect(countResults(view)).toBe(0);
        expect(readRound(view)?.n).toBe((roundBefore?.n ?? 0) + 1);
        expect(onComplete).not.toHaveBeenCalled();
        return;
      }
      case 'finish': {
        const button = view.queryByRole('button', { name: FINISH_LABEL });
        if (!button) return; // Only rendered on the final reveal.
        fireEvent.press(button);
        // Let the completion effect settle so the terminal phase is observable.
        await waitFor(() =>
          expect(view.queryAllByRole('button', { name: /^Play headline:/ })).toHaveLength(0),
        );
        return;
      }
      case 'earlyCommit': {
        // In `choose` the prediction controls do not exist; prove their absence.
        if (currentPhase(view) === 'choose') {
          expect(view.queryByRole('button', { name: UP_LABEL })).toBeNull();
          expect(view.queryByRole('button', { name: DOWN_LABEL })).toBeNull();
          expect(countResults(view)).toBe(0);
          expect(onComplete).not.toHaveBeenCalled();
        }
        return;
      }
      case 'earlyNext': {
        // In `predict` the next/finish controls do not exist; prove their
        // absence and that no result has been revealed.
        if (currentPhase(view) === 'predict') {
          expect(view.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
          expect(view.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
          expect(countResults(view)).toBe(0);
          expect(onComplete).not.toHaveBeenCalled();
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * Generate a randomized event sequence that always mixes the required
   * families. Early/invalid and conflicting events are sprinkled anywhere; legal
   * `choose`/`commit`/`next`/`finish` events drive real progress. Whether the
   * sequence happens to reach a valid final finish is left to the generator so
   * both "completed exactly once" and "never completed" sequences are produced.
   */
  function generateSequence(rng: Rng): P10EventKind[] {
    const kinds: P10EventKind[] = [
      'selectKnown',
      'selectSecond',
      'duplicateSelect',
      'commitUp',
      'commitDown',
      'duplicateCommit',
      'conflictingCommit',
      'next',
      'duplicateNext',
      'finish',
      'earlyCommit',
      'earlyNext',
    ];
    const length = randomInt(rng, 6, 24);
    const sequence: P10EventKind[] = [];
    for (let i = 0; i < length; i++) {
      sequence.push(kinds[randomInt(rng, 0, kinds.length - 1)]);
    }
    return sequence;
  }

  /**
   * Run one generated sequence against a fresh render and assert the global
   * invariants: every intermediate state is internally consistent (checked in
   * applyEvent), `onComplete` fires only after a legal final finish, and it
   * fires at most once.
   */
  async function checkSequence(sequence: P10EventKind[], seedLabel: string): Promise<void> {
    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={P10_PARAMS} seed={7} onComplete={onComplete} />
      </ThemeProvider>,
    );
    try {
      for (const kind of sequence) {
        // A legal final finish is the ONLY event allowed to newly complete: it
        // is a `finish` fired while the final-round finish control is rendered.
        const wasFinalReveal =
          view.queryByRole('button', { name: FINISH_LABEL }) !== null && kind === 'finish';
        const callsBefore = onComplete.mock.calls.length;

        await applyEvent(view, kind, onComplete);

        if (!wasFinalReveal) {
          // Any non-(legal-final-finish) event cannot have newly completed.
          expect(onComplete.mock.calls.length).toBe(callsBefore);
        }
      }

      // onComplete is called at most once across the whole sequence.
      expect(onComplete.mock.calls.length).toBeLessThanOrEqual(1);

      if (onComplete.mock.calls.length === 1) {
        // A completion only happens from the terminal `completed` phase: no
        // game controls remain, and the payload is contract-shaped.
        expect(currentPhase(view)).toBe('completed');
        expect(view.queryAllByRole('button', { name: /^Play headline:/ })).toHaveLength(0);
        expect(view.queryByRole('button', { name: UP_LABEL })).toBeNull();
        expect(view.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
        const payload = onComplete.mock.calls[0][0];
        expect(typeof payload.score).toBe('number');
        expect(payload.score).toBeGreaterThanOrEqual(0);
        expect(payload.score).toBeLessThanOrEqual(100);
        expect(typeof payload.summary).toBe('string');
      } else {
        // An unfinished / aborted sequence never completes.
        expect(onComplete).not.toHaveBeenCalled();
      }
    } catch (error) {
      throw new Error(`case ${seedLabel} failed its interaction-lock assertions: ${String(error)}`);
    } finally {
      view.unmount();
    }
  }

  // A single top-level seed makes the whole run reproducible from one number;
  // each case also carries its own derived seed for isolated replay.
  const P10_GENERATION_SEED = 0x5a17c3;
  const P10_GENERATED_CASES = 120;

  const p10Cases: { label: string; sequence: P10EventKind[] }[] = (() => {
    const seedRng = mulberry32(P10_GENERATION_SEED);
    const cases: { label: string; sequence: P10EventKind[] }[] = [];
    for (let i = 0; i < P10_GENERATED_CASES; i++) {
      const caseSeed = randomInt(seedRng, 0, 0xffffffff);
      const rng = mulberry32(caseSeed);
      cases.push({
        label: `seed=${P10_GENERATION_SEED} case#${i} caseSeed=${caseSeed}`,
        sequence: generateSequence(rng),
      });
    }
    return cases;
  })();

  // Explicit boundary fixtures pinning the key corners the generator may or may
  // not hit on any given run.
  const p10Fixtures: { label: string; sequence: P10EventKind[] }[] = [
    // Early commit while in `choose` is a no-op, then a legal full play-through
    // that finishes exactly once.
    {
      label: 'fixture:early-commit-then-full-finish',
      sequence: [
        'earlyCommit',
        'commitUp',
        'next',
        'commitDown',
        'next',
        'commitUp',
        'finish',
      ],
    },
    // Early next while in `predict` is a no-op; sequence never finishes.
    {
      label: 'fixture:early-next-unfinished',
      sequence: ['selectKnown', 'earlyNext', 'duplicateSelect'],
    },
    // Conflicting double commit cannot change the locked result.
    {
      label: 'fixture:conflicting-commit-locks',
      sequence: ['selectKnown', 'conflictingCommit', 'next', 'commitUp', 'next', 'finish'],
    },
    // Duplicate commit (double tap) yields a single result and one advance.
    {
      label: 'fixture:duplicate-commit-single-result',
      sequence: ['duplicateCommit', 'duplicateNext', 'commitUp', 'next', 'commitDown', 'finish'],
    },
    // Finish attempted on a non-final reveal is not available (next instead); no
    // completion until the real final finish.
    {
      label: 'fixture:finish-blocked-until-last-round',
      sequence: ['commitUp', 'finish', 'next', 'commitUp', 'finish', 'next', 'commitUp', 'finish'],
    },
  ];

  it.each(p10Fixtures.map((c) => [c.label, c.sequence] as const))(
    'locks the machine for boundary fixture %s',
    async (label, sequence) => {
      await checkSequence(sequence, label);
    },
  );

  it.each(p10Cases.map((c) => [c.label, c.sequence] as const))(
    'locks the machine for generated sequence %s',
    async (label, sequence) => {
      await checkSequence(sequence, label);
    },
  );
});

// Feature: interactive-auction-room, Property 11: Live play is equivalent to the replay oracle
//
// For every generated session, driving the live <Auction> component through its
// full choose -> predict -> reveal -> next/finish loop must produce exactly the
// same outcome the pure `scoreAuction` oracle produces for the identical params,
// seed, and choice sequence. The component builds `mulberry32(seed)` internally
// and advances it once per applied round; the oracle is fed a FRESH
// `mulberry32(seed)` and the SAME `AuctionChoice[]`, so by requirements 6.3/6.4
// the live `onComplete({ score, summary })` payload and the oracle's
// `score`/`summary` must agree — and the live final price (observable as the
// revealed price of the last round) must equal the oracle's `finalPriceCents`.
//
// RNG-budget proof — exactly one draw per applied round:
//   The component owns its generator internally, so the strongest observable
//   seam is a counting spy on `mulberry32`. We `jest.spyOn` the rng module and
//   wrap each generator it hands out with a counter; the component's named
//   import resolves through the module namespace under the Jest/Babel CommonJS
//   transform, so its live draws flow through the spy. We snapshot the counter
//   around the live play and assert it advanced exactly `rounds` times (one draw
//   per applied round). The oracle is built from an UNWRAPPED generator obtained
//   via `jest.requireActual`, so oracle draws never pollute the live count and
//   the two paths are compared on identical, independently-seeded streams.
//
// Cases are generated dependency-free with `mulberry32`/`randomInt` (no
// fast-check). Each case picks valid params (2-4 headlines, 1..N rounds, noise
// possibly on), a uint32 seed, and a per-round plan of (headline index,
// prediction). The generation seed and per-case seed are in every failure label
// for replay. `it.each` gives each of the 100+ cases its own React root.
describe('<Auction /> — Property 11: live play is equivalent to the replay oracle (requirements 6.3, 6.4)', () => {
  // The ORIGINAL, unwrapped `mulberry32` captured before any spy is installed.
  // `rngModule` is the live namespace the component imports from, so spying on
  // `rngModule.mulberry32` intercepts the component's draws; calling the
  // captured original inside the spy (and to build the oracle) avoids recursing
  // through the spy and keeps the oracle's draws off the live counter.
  const realMulberry32 = rngModule.mulberry32;

  // Live-draw counter. Reset before each live render; the spy increments it once
  // per draw the component (or anything using the spied `mulberry32`) performs.
  let liveDraws = 0;

  beforeEach(() => {
    liveDraws = 0;
    // Wrap every generator the module hands out with a counting closure. The
    // component imports `mulberry32` from this module, so its one-per-round
    // draws are observed here. Behavior is preserved (same stream, same
    // numbers) — only a side counter is added. We call the captured ORIGINAL,
    // not the (now-spied) module property, so there is no recursion.
    jest.spyOn(rngModule, 'mulberry32').mockImplementation((seed: number): Rng => {
      const generator = realMulberry32(seed);
      return () => {
        liveDraws += 1;
        return generator();
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** One generated session: the raw params/seed and a per-round plan. */
  interface GeneratedSession {
    params: {
      startPriceCents: number;
      baseDemand: number;
      baseSupply: number;
      sensitivity: number;
      noise: number;
      rounds: number;
      headlines: { id: string; text: string; demandDelta: number; supplyDelta: number }[];
    };
    seed: number;
    /** Per round: index into `headlines` and the predicted direction. */
    plan: { headlineIndex: number; prediction: 'up' | 'down' }[];
    label: string;
  }

  /**
   * Build one valid generated session from a seeded RNG: 2-4 distinct headline
   * cards, 1..6 rounds, a uint32 seed, noise sometimes on, and a per-round plan
   * choosing a headline and a prediction. Headline text is unique so the
   * `Play headline: <text>` button labels never collide.
   */
  function generateSession(rng: Rng, label: string): GeneratedSession {
    const headlineCount = randomInt(rng, 2, 4);
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => ({
      id: `h${i}`,
      text: `Headline ${i} (${label.replace(/[^a-zA-Z0-9]/g, '')})`,
      // Deltas span bull/bear/neutral so directions vary across the plan.
      demandDelta: randomInt(rng, -500, 500),
      supplyDelta: randomInt(rng, -500, 500),
    }));
    const rounds = randomInt(rng, 1, 6);
    const seed = randomInt(rng, 0, 0xffffffff);
    const plan = Array.from({ length: rounds }, () => ({
      headlineIndex: randomInt(rng, 0, headlineCount - 1),
      prediction: (rng() < 0.5 ? 'up' : 'down') as 'up' | 'down',
    }));
    return {
      params: {
        startPriceCents: randomInt(rng, 100, 1_000_000),
        baseDemand: randomInt(rng, 0, 1000),
        baseSupply: randomInt(rng, 0, 1000),
        sensitivity: rng() * 0.5,
        noise: rng() < 0.5 ? 0 : rng() * 0.05,
        rounds,
        headlines,
      },
      seed,
      plan,
      label,
    };
  }

  /**
   * Drive one planned round through the live UI: choose the planned headline,
   * commit the planned prediction, then advance (next) or finish. Awaits each
   * phase transition so act() scopes never overlap and the next tap lands on the
   * re-rendered phase.
   */
  async function playPlannedRound(
    view: Awaited<ReturnType<typeof render>>,
    session: GeneratedSession,
    roundIndex: number,
    last: boolean,
  ): Promise<void> {
    const step = session.plan[roundIndex];
    const headlineText = session.params.headlines[step.headlineIndex].text;
    fireEvent.press(view.getByRole('button', { name: `Play headline: ${headlineText}` }));
    const predictLabel =
      step.prediction === 'up'
        ? 'Predict the price will go up'
        : 'Predict the price will go down';
    fireEvent.press(await view.findByRole('button', { name: predictLabel }));
    const continueLabel = last ? 'See your result' : 'Go to the next round';
    fireEvent.press(await view.findByRole('button', { name: continueLabel }));
  }

  /**
   * Render, play the full generated session live, capture the `onComplete`
   * payload and the number of live RNG draws, then compare against the pure
   * oracle fed a fresh unwrapped `mulberry32(seed)` and the same choices.
   */
  async function checkSession(session: GeneratedSession): Promise<void> {
    const { params, seed, plan, label } = session;
    const onComplete = jest.fn();

    const drawsBefore = liveDraws;
    const view = await render(
      <ThemeProvider>
        <Auction params={params} seed={seed} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      for (let i = 0; i < plan.length; i++) {
        const last = i === plan.length - 1;
        await playPlannedRound(view, session, i, last);
        if (!last) {
          // Wait for the next round to render before driving it.
          await view.findByText(`Round ${i + 2} of ${params.rounds}`);
        }
      }

      // The live session completed exactly once with a contract-shaped payload.
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      const livePayload = onComplete.mock.calls[0][0] as { score: number; summary: string };
      const liveDrawCount = liveDraws - drawsBefore;

      // Build the oracle from the SAME choices and a FRESH, UNWRAPPED generator
      // so the two independently-seeded streams are compared and the oracle's
      // own draws never touch the live counter.
      const choices: AuctionChoice[] = plan.map((step) => ({
        headlineId: params.headlines[step.headlineIndex].id,
        prediction: step.prediction,
      }));
      const oracle = scoreAuction(parseAuctionParams(params), choices, realMulberry32(seed));

      // Requirements 6.3/6.4: identical seed + identical choices => identical
      // outcome. Live play and the oracle must agree on score and summary.
      expect(livePayload.score).toBe(oracle.score);
      expect(livePayload.summary).toBe(oracle.summary);

      // The final live price (the revealed price of the last round) must equal
      // the oracle's final price — the strongest observable equivalence of the
      // seeded price path between the two code paths.
      expect(view.getByText(formatDollars(oracle.finalPriceCents))).toBeTruthy();

      // Exactly one draw per applied round on the live path (requirement 6.4),
      // proven by the counting spy. The oracle draws once per round by the pure
      // sim tests, so the equal count establishes both paths share the budget.
      expect(liveDrawCount).toBe(params.rounds);
    } catch (error) {
      throw new Error(`case ${label} failed its live-vs-oracle assertions: ${String(error)}`);
    } finally {
      view.unmount();
    }
  }

  // One top-level generation seed makes the whole run reproducible from a single
  // number; each case's label also carries its own derived seed for replay.
  const P11_GENERATION_SEED = 0x7c1e93a;
  const P11_GENERATED_CASES = 120;

  const p11Cases: GeneratedSession[] = (() => {
    const seedRng = realMulberry32(P11_GENERATION_SEED);
    const cases: GeneratedSession[] = [];
    for (let i = 0; i < P11_GENERATED_CASES; i++) {
      const caseSeed = randomInt(seedRng, 0, 0xffffffff);
      const rng = realMulberry32(caseSeed);
      const label = `seed=${P11_GENERATION_SEED} case#${i} caseSeed=${caseSeed}`;
      cases.push(generateSession(rng, label));
    }
    return cases;
  })();

  it.each(p11Cases.map((c) => [c.label, c] as const))(
    'live play equals the oracle for generated session %s',
    async (_label, session) => {
      await checkSession(session);
    },
  );
});

// Feature: interactive-auction-room, Property 12: Completion is emitted exactly once
//
// `onComplete` fires at most once, and exactly once only for a valid final
// finish (requirements 1.3, 1.4). Two families of generated sessions prove the
// boundary from the observable UI alone (never reaching into component state):
//
//  (a) Complete sessions: every round is played (choose -> commit -> next) and
//      the final round's "See your result" finish control is pressed. To stress
//      the at-most-once completion guard the finish button is fired 2-3 times
//      in a row and tapped again after completion has settled; the component's
//      completion ref must still have emitted exactly one `{ score, summary }`
//      payload with a numeric score in 0..100 and a string summary.
//
//  (b) Incomplete sessions: play stops somewhere before pressing the final
//      finish — ending in a non-final round's choose/predict/reveal, or on the
//      final reveal but never pressing finish. `onComplete` is never called.
//
// Both the number of rounds and the stop point are generated, so the two
// families are driven by the same generator. Cases are built dependency-free
// with the existing `mulberry32`/`randomInt` RNG (no fast-check); the generation
// seed and per-case seed are in every failure label for replay, and `it.each`
// gives each of the 100+ cases its own React root so repeated mount/unmount
// cycles never share a single root.
describe('<Auction /> — Property 12: completion is emitted exactly once (requirements 1.3, 1.4)', () => {
  // Noise is zero so direction is decided by the headline alone, but Property 12
  // only cares about the completion boundary, not the specific score.
  const P12_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';
  const HEADLINE_PATTERN = /^Play headline:/;

  type RenderResult = Awaited<ReturnType<typeof render>>;

  /** Where an incomplete session stops relative to the final finish. */
  type P12StopPhase = 'choose' | 'predict' | 'reveal';

  /**
   * One generated session. `rounds` is the authored round count; `prediction`
   * fixes which up/down control each round commits. `complete` selects the
   * family: a complete session finishes (with repeated/late finish taps), while
   * an incomplete session stops at `stopPhase` of its last-played round and
   * never presses the final finish.
   */
  interface P12Session {
    rounds: number;
    prediction: 'up' | 'down';
    complete: boolean;
    /** For incomplete sessions: the round (1-based) the session stops on. */
    stopRound: number;
    /** For incomplete sessions: the phase within `stopRound` to stop at. */
    stopPhase: P12StopPhase;
    /** For complete sessions: how many extra finish taps to fire (1..2). */
    extraFinishTaps: number;
    label: string;
  }

  /**
   * Build one generated session from a seeded RNG. Half the cases complete and
   * half stop short; the stop round/phase and the number of repeated finish taps
   * are all generated so both families are exercised across the 100+ cases.
   */
  function generateSession(rng: Rng, label: string): P12Session {
    const rounds = randomInt(rng, 1, 6);
    const prediction: 'up' | 'down' = rng() < 0.5 ? 'up' : 'down';
    const complete = rng() < 0.5;
    const stopRound = randomInt(rng, 1, rounds);
    const stopPhases: P12StopPhase[] = ['choose', 'predict', 'reveal'];
    const stopPhase = stopPhases[randomInt(rng, 0, stopPhases.length - 1)];
    // 1..2 EXTRA finish taps on top of the first, so the finish button is fired
    // 2-3 times total for a complete session.
    const extraFinishTaps = randomInt(rng, 1, 2);
    return { rounds, prediction, complete, stopRound, stopPhase, extraFinishTaps, label };
  }

  /** The prediction control label for this session's chosen direction. */
  function predictLabelFor(prediction: 'up' | 'down'): string {
    return prediction === 'up' ? UP_LABEL : DOWN_LABEL;
  }

  /**
   * Play one full round (choose -> commit -> next) through the live UI, awaiting
   * each phase transition so act() scopes never overlap and the next tap lands
   * on the re-rendered phase. Used for every round before the stop/finish round.
   */
  async function playRoundThrough(
    view: RenderResult,
    prediction: 'up' | 'down',
  ): Promise<void> {
    const headline = view.getAllByRole('button', { name: HEADLINE_PATTERN })[0];
    fireEvent.press(headline);
    fireEvent.press(await view.findByRole('button', { name: predictLabelFor(prediction) }));
    fireEvent.press(await view.findByRole('button', { name: NEXT_LABEL }));
  }

  /**
   * Drive a COMPLETE session: play every round, then on the final round choose,
   * commit, and press the finish control multiple times (plus one more tap after
   * completion settles). Asserts onComplete fired EXACTLY once with a contract-
   * shaped payload — the completion ref must reject every repeated/late tap.
   */
  async function runComplete(view: RenderResult, session: P12Session, onComplete: jest.Mock) {
    const { rounds, prediction, extraFinishTaps } = session;
    // Play rounds 1..rounds-1 fully (choose -> commit -> next).
    for (let i = 0; i < rounds - 1; i++) {
      await playRoundThrough(view, prediction);
      await view.findByText(`Round ${i + 2} of ${rounds}`);
    }
    // Final round: choose + commit, then the finish control appears.
    fireEvent.press(view.getAllByRole('button', { name: HEADLINE_PATTERN })[0]);
    fireEvent.press(await view.findByRole('button', { name: predictLabelFor(prediction) }));
    const finishButton = await view.findByRole('button', { name: FINISH_LABEL });

    // First finish tap completes the session.
    fireEvent.press(finishButton);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // Repeated finish taps on the already-captured node after completion has
    // settled: every one must be a no-op (phase guard + completion ref), so the
    // emit count stays at one. Fire 1..2 extra taps so the button is pressed
    // 2-3 times in total across this session.
    for (let i = 0; i < extraFinishTaps; i++) {
      fireEvent.press(finishButton);
    }
    // A late tap once the terminal phase is observable (controls gone).
    await waitFor(() =>
      expect(view.queryAllByRole('button', { name: HEADLINE_PATTERN })).toHaveLength(0),
    );
    fireEvent.press(finishButton);

    // Still exactly one completion, with a contract-shaped payload.
    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0][0] as { score: number; summary: string };
    expect(typeof payload.score).toBe('number');
    expect(Number.isInteger(payload.score)).toBe(true);
    expect(payload.score).toBeGreaterThanOrEqual(0);
    expect(payload.score).toBeLessThanOrEqual(100);
    expect(typeof payload.summary).toBe('string');
    expect(payload.summary.length).toBeGreaterThan(0);
  }

  /**
   * Drive an INCOMPLETE session: play full rounds up to the stop round, then
   * stop within that round at `stopPhase` (choose: do nothing after it renders;
   * predict: only choose a headline; reveal: choose + commit but never press
   * finish/next). onComplete must never be called.
   */
  async function runIncomplete(view: RenderResult, session: P12Session, onComplete: jest.Mock) {
    const { rounds, prediction, stopRound, stopPhase } = session;
    // Fully play every round before the stop round.
    for (let i = 0; i < stopRound - 1; i++) {
      await playRoundThrough(view, prediction);
      await view.findByText(`Round ${i + 2} of ${rounds}`);
    }

    // We are now at the start (`choose`) of `stopRound`.
    if (stopPhase === 'choose') {
      // Stop in `choose`: the headline cards are shown and nothing is committed.
      expect(view.getAllByRole('button', { name: HEADLINE_PATTERN }).length).toBeGreaterThan(0);
    } else if (stopPhase === 'predict') {
      // Stop in `predict`: a headline is selected but no prediction is locked.
      fireEvent.press(view.getAllByRole('button', { name: HEADLINE_PATTERN })[0]);
      await view.findByRole('button', { name: predictLabelFor(prediction) });
    } else {
      // Stop in `reveal`: choose + commit so the result and the continue/finish
      // control are shown, but neither next nor finish is ever pressed. On the
      // final round this is the "final reveal but never finish" case.
      fireEvent.press(view.getAllByRole('button', { name: HEADLINE_PATTERN })[0]);
      fireEvent.press(await view.findByRole('button', { name: predictLabelFor(prediction) }));
      const continueLabel = stopRound >= rounds ? FINISH_LABEL : NEXT_LABEL;
      await view.findByRole('button', { name: continueLabel });
    }

    // An incomplete session never completes. Give any pending effects a chance
    // to run, then assert zero completions.
    await waitFor(() => expect(onComplete).not.toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
  }

  /**
   * Render one generated session and assert the completion boundary for its
   * family: exactly once for a complete session, never for an incomplete one.
   */
  async function checkSession(session: P12Session): Promise<void> {
    const onComplete = jest.fn();
    const params = { ...P12_PARAMS, rounds: session.rounds };
    const view = await render(
      <ThemeProvider>
        <Auction params={params} seed={11} onComplete={onComplete} />
      </ThemeProvider>,
    );
    try {
      if (session.complete) {
        await runComplete(view, session, onComplete);
      } else {
        await runIncomplete(view, session, onComplete);
      }
    } catch (error) {
      throw new Error(`case ${session.label} failed its completion-boundary assertions: ${String(error)}`);
    } finally {
      view.unmount();
    }
  }

  // One top-level generation seed makes the whole run reproducible from a single
  // number; each case's label also carries its own derived seed for replay.
  const P12_GENERATION_SEED = 0x3f91d7;
  const P12_GENERATED_CASES = 120;

  const p12Cases: P12Session[] = (() => {
    const seedRng = mulberry32(P12_GENERATION_SEED);
    const cases: P12Session[] = [];
    for (let i = 0; i < P12_GENERATED_CASES; i++) {
      const caseSeed = randomInt(seedRng, 0, 0xffffffff);
      const rng = mulberry32(caseSeed);
      const label = `seed=${P12_GENERATION_SEED} case#${i} caseSeed=${caseSeed}`;
      cases.push(generateSession(rng, label));
    }
    return cases;
  })();

  // Explicit boundary fixtures pinning the corners the generator may or may not
  // hit on a given run: both families, single- and multi-round, and the
  // "final reveal but never finish" incomplete case.
  const p12Fixtures: P12Session[] = [
    {
      rounds: 1,
      prediction: 'up',
      complete: true,
      stopRound: 1,
      stopPhase: 'reveal',
      extraFinishTaps: 2,
      label: 'fixture:single-round-complete-triple-finish',
    },
    {
      rounds: 3,
      prediction: 'down',
      complete: true,
      stopRound: 3,
      stopPhase: 'reveal',
      extraFinishTaps: 1,
      label: 'fixture:multi-round-complete-double-finish',
    },
    {
      rounds: 2,
      prediction: 'up',
      complete: false,
      stopRound: 1,
      stopPhase: 'choose',
      extraFinishTaps: 1,
      label: 'fixture:incomplete-stop-in-choose',
    },
    {
      rounds: 2,
      prediction: 'up',
      complete: false,
      stopRound: 2,
      stopPhase: 'predict',
      extraFinishTaps: 1,
      label: 'fixture:incomplete-stop-in-predict',
    },
    {
      rounds: 2,
      prediction: 'down',
      complete: false,
      stopRound: 2,
      stopPhase: 'reveal',
      extraFinishTaps: 1,
      label: 'fixture:incomplete-final-reveal-never-finish',
    },
  ];

  it.each(p12Fixtures.map((c) => [c.label, c] as const))(
    'emits completion exactly once for boundary fixture %s',
    async (_label, session) => {
      await checkSession(session);
    },
  );

  it.each(p12Cases.map((c) => [c.label, c] as const))(
    'emits completion exactly once for generated session %s',
    async (_label, session) => {
      await checkSession(session);
    },
  );
});

// Feature: interactive-auction-room, Task 5.7: focused phase and duplicate-tap regressions
//
// Concrete, readable pin-point regressions for the guarded state machine
// (requirements 1.3, 1.4, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.4, 6.4). Property
// 10/11/12 cover the locking, live-vs-oracle equivalence, and completion
// boundary broadly across generated sequences; these are small fixed-param
// examples that pin individual behaviors so a regression names itself.
//
// All fixtures use noise 0 so the headline alone decides direction and the exact
// revealed prices are deterministic. The two cards are an unambiguous bull and
// bear so a committed prediction's correctness is predictable:
//   start $100.00 (10000¢), baseDemand/baseSupply 50, sensitivity 0.2
//   bull (demandDelta 40): demand 90 / supply 50 -> up   -> 10000*(1+0.2*40/140) = 10571¢ ($105.71)
//   bear (supplyDelta 40): demand 50 / supply 90 -> down -> 10000*(1-0.2*40/140) =  9429¢ ($94.29)
// Round 2 carries the revealed price forward as its starting price.
describe('<Auction /> — Task 5.7: focused phase and duplicate-tap regressions (requirements 1.3, 1.4, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.4, 6.4)', () => {
  // A deterministic bull/bear deck. Noise 0 makes every revealed price exact.
  const S57_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  // A three-round deck for the carried-price and non-final/final control checks.
  const S57_PARAMS_3 = { ...S57_PARAMS, rounds: 3 } as const;

  const BULL_LABEL = 'Play headline: Great earnings';
  const BEAR_LABEL = 'Play headline: Factory fire';
  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';
  const RESULT_PATTERN = /The price moved/;

  // Exact revealed prices for the bull/bear cards from a $100.00 start (noise 0).
  const BULL_AFTER = '$105.71';
  const BEAR_AFTER = '$94.29';

  // 4.2, 5.4: selecting a headline retains it and shows its text in predict.
  it('retains the selected headline and shows its text in the predict phase', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    // The predict phase is entered and the chosen headline text is visible.
    expect(await screen.findByRole('button', { name: UP_LABEL })).toBeTruthy();
    expect(screen.getByText('Great earnings')).toBeTruthy();
    // The other card's text is not shown as a selectable control anymore.
    expect(screen.queryByRole('button', { name: BEAR_LABEL })).toBeNull();
  });

  // 4.3: a prediction is required before any result is revealed.
  it('reveals no result until a direction is committed', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    // Prediction controls exist, but no result text and no continue control yet.
    expect(await screen.findByRole('button', { name: UP_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: DOWN_LABEL })).toBeTruthy();
    expect(screen.queryByText(RESULT_PATTERN)).toBeNull();
    expect(screen.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
  });

  // 4.4, 4.5: committing locks the prediction. The up/down controls disappear and
  // the revealed direction matches the committed-round outcome (bull -> up).
  it('locks the prediction on commit: up/down controls disappear and the revealed direction matches the round outcome', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));

    // The committed round reveals the bull outcome: price up to $105.71.
    expect(await screen.findByText(`The price moved up to ${BULL_AFTER}.`)).toBeTruthy();
    // The prediction pair is gone — it cannot be changed after locking.
    expect(screen.queryByRole('button', { name: UP_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: DOWN_LABEL })).toBeNull();
  });

  // 4.5: a conflicting second commit after the lock cannot change the revealed
  // result. The up/down controls are already gone, so the stale/opposite tap on
  // the captured node is a no-op and the revealed direction/price is unchanged.
  it('rejects a conflicting second commit and keeps the originally revealed result', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    const upButton = await screen.findByRole('button', { name: UP_LABEL });
    const downButton = screen.getByRole('button', { name: DOWN_LABEL });
    fireEvent.press(upButton);
    // Settle the reveal, then fire the opposite (now stale) commit button.
    await screen.findByText(`The price moved up to ${BULL_AFTER}.`);
    fireEvent.press(downButton);
    // The revealed direction/price did not change to the bear (down) outcome.
    expect(screen.getByText(`The price moved up to ${BULL_AFTER}.`)).toBeTruthy();
    expect(screen.queryByText(`The price moved down to ${BEAR_AFTER}.`)).toBeNull();
    expect(screen.queryByText(new RegExp(`The price moved down`))).toBeNull();
  });

  // 4.4, 6.4: a double-tap on the same prediction control produces exactly one
  // result for the round (one applied round -> one reveal line, one rng draw).
  it('produces exactly one result when the prediction control is double-tapped', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    const upButton = await screen.findByRole('button', { name: UP_LABEL });
    fireEvent.press(upButton);
    // Settle, then fire the same (now stale) node again — must be a no-op.
    await screen.findByText(RESULT_PATTERN);
    fireEvent.press(upButton);
    expect(screen.queryAllByText(RESULT_PATTERN)).toHaveLength(1);
  });

  // 2.2 (shape) / 6.4: exactly one result line is on screen per revealed round.
  it('shows exactly one result line per round', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(RESULT_PATTERN);
    expect(screen.queryAllByText(RESULT_PATTERN)).toHaveLength(1);
  });

  // 4.6: round 2's displayed starting price equals round 1's revealed after-price.
  it("carries price forward: round 2's starting price equals round 1's revealed after-price", async () => {
    await renderWithTheme(<Auction params={S57_PARAMS_3} seed={1} onComplete={jest.fn()} />);
    // Round 1: bull reveals $105.71.
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    expect(await screen.findByText(`The price moved up to ${BULL_AFTER}.`)).toBeTruthy();
    // Advance to round 2 — its starting (current) price is the carried $105.71.
    fireEvent.press(screen.getByRole('button', { name: NEXT_LABEL }));
    await screen.findByText('Round 2 of 3');
    expect(
      screen.getByLabelText(`Current price ${BULL_AFTER}`),
    ).toBeTruthy();
    expect(screen.getByText(BULL_AFTER)).toBeTruthy();
  });

  // 4.6: a non-final reveal shows the "next round" control, not the finish one.
  it('shows the next-round control (not finish) on a non-final reveal', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS_3} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(RESULT_PATTERN);
    expect(screen.getByRole('button', { name: NEXT_LABEL })).toBeTruthy();
    expect(screen.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
  });

  // 4.7: the final reveal shows the finish control, not the next-round one.
  it('shows the finish control (not next) on the final reveal', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={jest.fn()} />);
    // Round 1 (non-final) then round 2 (final).
    await playRound('Great earnings', 'up', false);
    await screen.findByText('Round 2 of 2');
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(RESULT_PATTERN);
    expect(screen.getByRole('button', { name: FINISH_LABEL })).toBeTruthy();
    expect(screen.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
  });

  // 4.6, 5.1: rapid duplicate "next" taps on a non-final reveal do not skip a
  // round — the round counter advances by exactly one.
  it('does not skip a round when the next control is rapidly double-tapped', async () => {
    await renderWithTheme(<Auction params={S57_PARAMS_3} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    const nextButton = await screen.findByRole('button', { name: NEXT_LABEL });
    fireEvent.press(nextButton);
    // Settle on round 2, then fire the stale captured node again.
    await screen.findByText('Round 2 of 3');
    fireEvent.press(nextButton);
    // Still on round 2 — the stale tap did not skip ahead to round 3.
    expect(screen.getByText('Round 2 of 3')).toBeTruthy();
    expect(screen.queryByText('Round 3 of 3')).toBeNull();
  });

  // 1.3, 1.4: rapid duplicate finish taps complete the lab exactly once.
  it('completes exactly once when the finish control is rapidly double-tapped', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={onComplete} />);
    await playRound('Great earnings', 'up', false);
    await screen.findByText('Round 2 of 2');
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    const finishButton = await screen.findByRole('button', { name: FINISH_LABEL });
    fireEvent.press(finishButton);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // The stale captured finish node fired again must be a no-op.
    fireEvent.press(finishButton);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // 1.4: onComplete is NOT called before the final finish — checked at the
  // intermediate (non-final) reveal and after advancing but before finishing.
  it('does not call onComplete before the final finish is pressed', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<Auction params={S57_PARAMS} seed={1} onComplete={onComplete} />);
    // At the round 1 (non-final) reveal: no completion yet.
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(RESULT_PATTERN);
    expect(onComplete).not.toHaveBeenCalled();
    // Advance to the final round and reach its reveal — still no completion
    // because the finish control has not been pressed.
    fireEvent.press(screen.getByRole('button', { name: NEXT_LABEL }));
    await screen.findByText('Round 2 of 2');
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(RESULT_PATTERN);
    expect(screen.getByRole('button', { name: FINISH_LABEL })).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    // Only the final finish completes.
    fireEvent.press(screen.getByRole('button', { name: FINISH_LABEL }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
// Feature: interactive-auction-room, Task 6.2: focused market-stage component tests
//
// These are example-based (not property) tests for the live market stage built
// in task 6.1 (requirements 2.1, 3.1, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.3). They
// assert the observable, accessible market UI only — the crowd demand/supply
// totals, the proportional balance meter, the deterministic bid/ask quotes, the
// expanded order-book depth, the `showMarketDepth: false` compact-only variant,
// the null-snapshot placeholder behavior, and the persistent educational
// framing across every phase. Expected quote/depth values are computed by
// importing the same pure `deriveMarketSnapshot`/`deriveCrowdTotals` the
// component uses, so the tests pin the component to the oracle rather than to
// hand-copied numbers.
describe('<Auction /> — market stage (task 6.2; requirements 2.1, 3.1, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.3)', () => {
  // Non-zero noise would not change the DISPLAYED (pre-commit) snapshot — the
  // market stage derives from the carried price and displayed totals, which
  // before any commit are the start price and the (baseline or previewed)
  // crowd. Keep noise zero so nothing about these assertions is incidental.
  const M_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: [
      // Bull: pushes demand up to 90 (50 + 40), supply stays 50.
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      // Bear: pushes supply up to 90 (50 + 40), demand stays 50.
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  const PARSED = parseAuctionParams(M_PARAMS);
  const BULL = PARSED.headlines.find((h) => h.id === 'bull')!;
  const BEAR = PARSED.headlines.find((h) => h.id === 'bear')!;

  const SIMULATION_LABEL = 'Simulation · No real money';
  const SIMULATED_QUOTE_LABEL = 'Simulated prices — not live market quotes';

  // 2.1: the opening market shows the authored baseline demand/supply, before
  // any headline is selected.
  it('shows the baseline demand and supply totals up front (2.1)', async () => {
    await renderWithTheme(<Auction params={M_PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getByLabelText('Buyers (demand): 50')).toBeTruthy();
    expect(screen.getByLabelText('Sellers (supply): 50')).toBeTruthy();
    // The balance meter is a labelled progressbar reflecting the same totals.
    expect(
      screen.getByLabelText('Buyers versus sellers: 50 buyers, 50 sellers'),
    ).toBeTruthy();
  });

  // 2.1, 3.1: selecting a headline card updates the displayed demand/supply to
  // deriveCrowdTotals(params, headline), and the balance meter proportions move
  // with them. Bull card -> demand 90, supply 50.
  it('updates displayed demand/supply and the balance meter when a headline is selected (2.1, 3.1)', async () => {
    await renderWithTheme(<Auction params={M_PARAMS} seed={1} onComplete={jest.fn()} />);

    const expected = deriveCrowdTotals(PARSED, BULL);
    expect(expected).toEqual({ demand: 90, supply: 50 });

    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    // The predict phase has rendered (the up control exists).
    await screen.findByRole('button', { name: 'Predict the price will go up' });

    // Displayed totals now match the derived preview totals, not the baselines.
    expect(screen.getByLabelText(`Buyers (demand): ${expected.demand}`)).toBeTruthy();
    expect(screen.getByLabelText(`Sellers (supply): ${expected.supply}`)).toBeTruthy();
    expect(
      screen.getByLabelText(
        `Buyers versus sellers: ${expected.demand} buyers, ${expected.supply} sellers`,
      ),
    ).toBeTruthy();
    // The old balanced meter label is gone — the proportions changed.
    expect(screen.queryByLabelText('Buyers versus sellers: 50 buyers, 50 sellers')).toBeNull();
  });

  // 3.1, 3.6: the bid/ask (and spread) update deterministically to match
  // deriveMarketSnapshot for the current price and the DISPLAYED totals. We
  // compare the initial (balanced) quotes and the post-selection (bull) quotes
  // against the oracle, and confirm the selection actually moved them.
  it('derives bid/ask/spread deterministically from deriveMarketSnapshot (3.1, 3.6)', async () => {
    await renderWithTheme(<Auction params={M_PARAMS} seed={1} onComplete={jest.fn()} />);

    const baseSnap = deriveMarketSnapshot(M_PARAMS.startPriceCents, 50, 50)!;
    expect(baseSnap).not.toBeNull();
    expect(
      screen.getByLabelText(
        `Bid ${formatDollars(baseSnap.bidCents)}. The highest price buyers will pay.`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        `Ask ${formatDollars(baseSnap.askCents)}. The lowest price sellers will accept.`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        `Spread ${formatDollars(baseSnap.spreadCents)}. The gap between bid and ask.`,
      ),
    ).toBeTruthy();

    // Select the bull card: demand 90, supply 50 at the same (not-yet-moved)
    // price. The quotes must now equal the oracle for those displayed totals.
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    await screen.findByRole('button', { name: 'Predict the price will go up' });

    const bullSnap = deriveMarketSnapshot(M_PARAMS.startPriceCents, 90, 50)!;
    expect(bullSnap).not.toBeNull();
    expect(
      screen.getByLabelText(
        `Bid ${formatDollars(bullSnap.bidCents)}. The highest price buyers will pay.`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        `Ask ${formatDollars(bullSnap.askCents)}. The lowest price sellers will accept.`,
      ),
    ).toBeTruthy();
    // The demand/supply imbalance widened the half-spread, so the quotes moved.
    expect(bullSnap.spreadCents).toBeGreaterThan(baseSnap.spreadCents);
  });

  // 3.5 (default): with showMarketDepth omitted (defaults to true), the expanded
  // three-level depth ladders render for both sides.
  it('renders the expanded buy/sell depth ladders by default (3.5)', async () => {
    await renderWithTheme(<Auction params={M_PARAMS} seed={1} onComplete={jest.fn()} />);
    // The default is true, so both ladders are present with their three levels.
    expect(screen.getByText('Buy orders')).toBeTruthy();
    expect(screen.getByText('Sell orders')).toBeTruthy();

    const snap = deriveMarketSnapshot(M_PARAMS.startPriceCents, 50, 50)!;
    // Each ladder renders exactly its three oracle levels as accessible rows.
    snap.buyLevels.forEach((level, i) => {
      expect(
        screen.getByLabelText(
          `Buy orders level ${i + 1}: ${level.quantity} at ${formatDollars(level.priceCents)}`,
        ),
      ).toBeTruthy();
    });
    snap.sellLevels.forEach((level, i) => {
      expect(
        screen.getByLabelText(
          `Sell orders level ${i + 1}: ${level.quantity} at ${formatDollars(level.priceCents)}`,
        ),
      ).toBeTruthy();
    });
  });

  // 3.4, 3.5 (showMarketDepth: false): the bid/ask quotes and the compact
  // proportional buy/sell strip still render, but the expanded depth ladders do
  // NOT. The compact strip label is derived from the snapshot side fractions.
  it('with showMarketDepth: false keeps quotes and the compact strip but drops the ladders (3.4, 3.5)', async () => {
    const compactParams = { ...M_PARAMS, showMarketDepth: false };
    await renderWithTheme(<Auction params={compactParams} seed={1} onComplete={jest.fn()} />);

    const snap = deriveMarketSnapshot(M_PARAMS.startPriceCents, 50, 50)!;
    // Bid/ask quotes still render.
    expect(
      screen.getByLabelText(
        `Bid ${formatDollars(snap.bidCents)}. The highest price buyers will pay.`,
      ),
    ).toBeTruthy();
    // The compact proportional buy/sell strip still renders.
    const buyPct = Math.round(Math.max(0, Math.min(1, snap.buyFraction)) * 100);
    const sellPct = Math.round(Math.max(0, Math.min(1, snap.sellFraction)) * 100);
    expect(
      screen.getByLabelText(`Resting orders: ${buyPct}% buy, ${sellPct}% sell`),
    ).toBeTruthy();
    // But the expanded three-level ladders are absent.
    expect(screen.queryByText('Buy orders')).toBeNull();
    expect(screen.queryByText('Sell orders')).toBeNull();
  });

  // 3.5 (null snapshot): with a positive start price and non-negative crowd,
  // deriveMarketSnapshot never returns null in normal play (price is always a
  // positive integer carried forward with a one-cent floor). So the panel path
  // we can actually reach renders real quotes, not the "—" placeholder — we
  // assert that directly, and confirm the placeholder path is only for an
  // unreachable null snapshot. Selecting a headline (which recomputes the
  // snapshot) does not change the round phase away from predict.
  it('renders real quotes rather than placeholders in normal play, and selection does not change phase (3.5)', async () => {
    await renderWithTheme(<Auction params={M_PARAMS} seed={1} onComplete={jest.fn()} />);
    const snap = deriveMarketSnapshot(M_PARAMS.startPriceCents, 50, 50);
    // Normal play never yields a null snapshot, so there is no "—" placeholder
    // and the "Order book unavailable" label is absent.
    expect(snap).not.toBeNull();
    expect(screen.queryByLabelText('Order book unavailable')).toBeNull();

    // Selecting a headline recomputes the snapshot (no RNG) and moves choose ->
    // predict, but it does not jump the phase to reveal/completed: the result
    // text only appears after a prediction is committed.
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Factory fire' }));
    await screen.findByRole('button', { name: 'Predict the price will go up' });
    // Still round 1, still no revealed result — the market panels never advance
    // the round phase.
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(screen.queryByText(/The price moved/)).toBeNull();
    // The bear preview totals (demand 50, supply 90) are reflected, confirming
    // the recompute happened without a phase change.
    const bearTotals = deriveCrowdTotals(PARSED, BEAR);
    expect(screen.getByLabelText(`Sellers (supply): ${bearTotals.supply}`)).toBeTruthy();
  });

  // 8.1, 8.2, 8.3: the persistent educational framing ("Simulation · No real
  // money" and the simulated-not-live quote label) is present in the choose,
  // predict, and reveal phases.
  it('keeps the educational framing visible in choose, predict, and reveal phases (8.1, 8.2, 8.3)', async () => {
    await renderWithTheme(<Auction params={M_PARAMS} seed={1} onComplete={jest.fn()} />);

    // choose phase.
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText(SIMULATION_LABEL)).toBeTruthy();
    expect(screen.getByLabelText(SIMULATED_QUOTE_LABEL)).toBeTruthy();

    // predict phase.
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    await screen.findByRole('button', { name: 'Predict the price will go up' });
    expect(screen.getByLabelText(SIMULATION_LABEL)).toBeTruthy();
    expect(screen.getByLabelText(SIMULATED_QUOTE_LABEL)).toBeTruthy();

    // reveal phase.
    fireEvent.press(screen.getByRole('button', { name: 'Predict the price will go up' }));
    await screen.findByText(/The price moved/);
    expect(screen.getByLabelText(SIMULATION_LABEL)).toBeTruthy();
    expect(screen.getByLabelText(SIMULATED_QUOTE_LABEL)).toBeTruthy();
  });
});
// Feature: interactive-auction-room, Task 6.4: focused interaction and reveal tests
//
// Example-based (not property) regressions for the headline chooser, the
// predict-phase active-card and prediction controls, and the persistent reveal
// panel built in task 6.3 (requirements 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7,
// 4.8, 5.4). They assert the observable, accessible UI only, pinning the exact
// reveal copy the component renders:
//   - the legacy `The price moved <direction> to <price>.` line;
//   - the stable `Price rose/fell/held from $X to $Y (±N¢).` result line;
//   - the increase/decrease/no-change wording with the signed cents; and
//   - the deterministic demand/supply-balance explanation.
//
// All fixtures use noise 0 so the headline alone decides direction and the exact
// revealed prices/cents are deterministic. From a $100 start, sensitivity 0.2,
// baselines 50/50:
//   bull (demandDelta 40): demand 90 / supply 50 -> up   -> 10000*(1+0.2*40/140) = 10571¢ ($105.71), +571¢
//   bear (supplyDelta 40): demand 50 / supply 90 -> down -> 10000*(1-0.2*40/140) =  9429¢ ($94.29),  -571¢
// A balanced headline (equal demand/supply) with noise 0 leaves the price
// unchanged: 10000¢ -> 10000¢, a 0¢ tie that resolves `up`.
describe('<Auction /> — interaction and reveal (task 6.4; requirements 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.4)', () => {
  // A two-headline bull/bear deck. Noise 0 makes every revealed price exact.
  const TWO_CARD_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  // A four-headline deck: two unambiguous (bull/bear) plus two more distinct
  // cards, to assert exactly four `Play headline:` cards render.
  const FOUR_CARD_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
      { id: 'mild-bull', text: 'Analyst upgrade', demandDelta: 10, supplyDelta: 0 },
      { id: 'mild-bear', text: 'Supply glut', demandDelta: 0, supplyDelta: 10 },
    ],
  } as const;

  // A single-round deck used where the reveal must immediately expose the finish
  // control; keeps the balanced-tie assertions free of a trailing round.
  const TWO_CARD_ONE_ROUND = { ...TWO_CARD_PARAMS, rounds: 1 } as const;

  // A balanced headline: demand 70 == supply 70 at a $100 start with noise 0, so
  // the price is unchanged (a 0¢ tie that resolves up). Used for the no-movement
  // balanced-market explanation and the signed `0¢` text.
  const BALANCED_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 20,
    baseSupply: 20,
    sensitivity: 0.2,
    noise: 0,
    rounds: 1,
    headlines: [
      // Both deltas 50 -> demand 70, supply 70: equal totals, zero imbalance.
      { id: 'balanced', text: 'Mixed signals', demandDelta: 50, supplyDelta: 50 },
      { id: 'other', text: 'Quiet session', demandDelta: 10, supplyDelta: 10 },
    ],
  } as const;

  const BULL_LABEL = 'Play headline: Great earnings';
  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';

  // 4.1: a two-headline params renders exactly two `Play headline:` cards.
  it('renders exactly two headline cards for a two-headline deck (4.1)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getAllByRole('button', { name: /^Play headline:/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Play headline: Great earnings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Factory fire' })).toBeTruthy();
  });

  // 4.1: a four-headline params renders exactly four `Play headline:` cards.
  it('renders exactly four headline cards for a four-headline deck (4.1)', async () => {
    await renderWithTheme(<Auction params={FOUR_CARD_PARAMS} seed={1} onComplete={jest.fn()} />);
    const cards = screen.getAllByRole('button', { name: /^Play headline:/ });
    expect(cards).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Play headline: Great earnings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Factory fire' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Analyst upgrade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Supply glut' })).toBeTruthy();
  });

  // 4.2: in predict, the selected card is marked (accessibilityState.selected +
  // `Playing headline:` label) and the other cards are no longer selectable.
  it('marks the active card as selected in predict and removes the other cards (4.2)', async () => {
    await renderWithTheme(<Auction params={FOUR_CARD_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    // The predict phase has rendered.
    expect(await screen.findByRole('button', { name: UP_LABEL })).toBeTruthy();

    // The chosen headline is retained and marked selected via its labelled view.
    const activeCard = screen.getByLabelText('Playing headline: Great earnings');
    expect(activeCard).toBeTruthy();
    expect(activeCard.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    // Its text is still visible to the learner.
    expect(screen.getByText('Great earnings')).toBeTruthy();

    // No headline cards remain selectable — the chooser is gone in predict.
    expect(screen.queryAllByRole('button', { name: /^Play headline:/ })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Play headline: Factory fire' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play headline: Analyst upgrade' })).toBeNull();
  });

  // 4.3: exactly the up and down prediction choices appear in predict — no more,
  // no fewer.
  it('shows exactly the up and down prediction choices in predict (4.3)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    expect(await screen.findByRole('button', { name: UP_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: DOWN_LABEL })).toBeTruthy();
    // Only those two prediction controls exist (the up/down pair) — the headline
    // cards and any continue/finish controls are absent in predict.
    expect(screen.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
  });

  // 2.6, 4.5, 4.8: an increase reveals the signed `+571¢`, the stable result
  // line, the increase wording, direction up, and the demand>supply explanation.
  it('reveals signed +cents, increase wording, and the buyers-dominant explanation on an up move (2.6, 4.5, 4.8)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_ONE_ROUND} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));

    // Legacy line (direction + new price) and the stable signed result line.
    expect(await screen.findByText('The price moved up to $105.71.')).toBeTruthy();
    expect(screen.getByText('Price rose from $100 to $105.71 (+571¢).')).toBeTruthy();
    // Increase wording with the signed cents and the computed direction.
    expect(screen.getByText('Price increase (+571¢) · direction up')).toBeTruthy();
    // Demand (90) > supply (50): buyers pushed bids higher.
    expect(screen.getByText('More buyers than sellers pushed bids higher.')).toBeTruthy();
  });

  // 2.6, 4.5, 4.8: a decrease reveals the signed `-571¢`, the decrease wording,
  // direction down, and the supply>demand explanation.
  it('reveals signed -cents, decrease wording, and the sellers-dominant explanation on a down move (2.6, 4.5, 4.8)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_ONE_ROUND} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Factory fire' }));
    fireEvent.press(await screen.findByRole('button', { name: DOWN_LABEL }));

    expect(await screen.findByText('The price moved down to $94.29.')).toBeTruthy();
    expect(screen.getByText('Price fell from $100 to $94.29 (-571¢).')).toBeTruthy();
    expect(screen.getByText('Price decrease (-571¢) · direction down')).toBeTruthy();
    // Supply (90) > demand (50): sellers pulled the price lower.
    expect(screen.getByText('More sellers than buyers pulled the price lower.')).toBeTruthy();
  });

  // 2.6, 4.8: a tie (balanced headline, equal demand/supply, noise 0) reveals the
  // signed `0¢`, the no-change wording, direction up, and the balanced-market
  // (no-movement) explanation.
  it('reveals 0¢, no-change wording, direction up, and the balanced-no-change explanation on a tie (2.6, 4.8)', async () => {
    await renderWithTheme(<Auction params={BALANCED_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Mixed signals' }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));

    // A tie resolves `up`; the price is unchanged at $100.
    expect(await screen.findByText('The price moved up to $100.')).toBeTruthy();
    expect(screen.getByText('Price held from $100 to $100 (0¢).')).toBeTruthy();
    // No-change wording carries the unsigned `0¢` and the up direction.
    expect(screen.getByText('Price no change (0¢) · direction up')).toBeTruthy();
    // Equal totals with no movement -> the balanced-out, no-change explanation.
    expect(
      screen.getByText('Buyers and sellers balanced out, so the rounded price did not change.'),
    ).toBeTruthy();
  });

  // 2.6, 5.4: the full result text is present immediately after the commit, with
  // no waiting on any animation/timer — queried synchronously in the same tick
  // the reveal renders (the commit's state flush is awaited via findBy once, then
  // every result line is asserted with the synchronous getBy).
  it('renders the full result immediately after commit without waiting on animation (2.6, 5.4)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_ONE_ROUND} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    // Commit the prediction; one awaited transition for the predict->reveal state
    // flush, then the entire result is already on screen — no act() advance or
    // timer flush needed.
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    const legacy = await screen.findByText('The price moved up to $105.71.');
    expect(legacy).toBeTruthy();
    // All reveal copy is synchronously present at the same time (not gated on a
    // delayed animation callback).
    expect(screen.getByText('Price rose from $100 to $105.71 (+571¢).')).toBeTruthy();
    expect(screen.getByText('Price increase (+571¢) · direction up')).toBeTruthy();
    expect(screen.getByText('More buyers than sellers pushed bids higher.')).toBeTruthy();
    // And the finish control is already exposed (single round), not deferred.
    expect(screen.getByRole('button', { name: FINISH_LABEL })).toBeTruthy();
  });

  // 4.6: a non-final reveal exposes the next-round control and not the finish one.
  it('exposes the next-round control (not finish) on a non-final reveal (4.6)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(/The price moved/);
    expect(screen.getByRole('button', { name: NEXT_LABEL })).toBeTruthy();
    expect(screen.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
  });

  // 4.7: the final reveal exposes the finish control and not the next-round one.
  it('exposes the finish control (not next) on the final reveal (4.7)', async () => {
    await renderWithTheme(<Auction params={TWO_CARD_PARAMS} seed={1} onComplete={jest.fn()} />);
    // Round 1 (non-final), then round 2 (final).
    await playRound('Great earnings', 'up', false);
    await screen.findByText('Round 2 of 2');
    fireEvent.press(screen.getByRole('button', { name: BULL_LABEL }));
    fireEvent.press(await screen.findByRole('button', { name: UP_LABEL }));
    await screen.findByText(/The price moved/);
    expect(screen.getByRole('button', { name: FINISH_LABEL })).toBeTruthy();
    expect(screen.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
  });
});

// Feature: interactive-auction-room, Property 13: Every reachable UI phase preserves accessible semantics
//
// For every generated valid session, play the live <Auction> through its full
// choose -> predict -> reveal loop (round by round) and, at EVERY reachable
// phase, assert the accessible semantics required by task 7.1 hold
// (requirements 7.1-7.7):
//
//  - 7.1 Button-only interactive controls: every element that is an interactive
//    control is a button (accessibilityRole 'button') with a non-empty
//    accessibilityLabel; there is no non-button interactive element on screen
//    (no 'link'/'switch'/'checkbox'/'menuitem'/'radio'/'tab' roles).
//  - 7.2 Full headline text in labels: in `choose`, every headline control's
//    label is `Play headline: <full headline text>` and contains the complete
//    authored text.
//  - 7.3 Explicit up/down wording: in `predict`, the two direction controls'
//    labels explicitly say the price will go "up" / "down".
//  - 7.4 Persistent `Round N of M`: the accessible round counter is present and
//    reads the correct 1-based round for the current round in every phase.
//  - 7.5/7.6 One named phase header: exactly one of the three phase-name headers
//    ("Choose a headline" / "Make your prediction" / "Round result") is present
//    at a time, and it names the current phase. (Counted among nodes with
//    accessibilityRole 'header'.)
//  - 7.7 Persistent reveal text + polite announcement: in `reveal`, the
//    persistent result text (the legacy `/The price moved/` line AND the richer
//    `Price rose/fell/held from ...` copy) is present and lives inside a polite
//    live region (the node or an ancestor carries accessibilityLiveRegion
//    'polite'). The text must survive regardless of any imperative announcement.
//
// Sessions are generated dependency-free with the existing `mulberry32` /
// `randomInt` RNG (no fast-check): valid params (2-4 distinct headlines with
// unique full text, 1..N rounds, noise sometimes on), a uint32 seed, and a
// per-round plan of (headline index, prediction). At least 100 cases run; the
// generation seed and per-case seed are in every failure label for replay, and
// `it.each` gives each case its own React root so the renders never share one.
describe('<Auction /> — Property 13: every reachable UI phase preserves accessible semantics (requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7)', () => {
  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';
  const HEADLINE_PATTERN = /^Play headline:/;
  const RESULT_PATTERN = /The price moved/;
  const RESULT_LINE_PATTERN = /Price (rose|fell|held) from .* to .* \(.*\)\./;
  const ROUND_PATTERN = /^Round (\d+) of (\d+)$/;

  // The three active phase-header labels PhaseHeader can render. Exactly one is
  // ever present at a time; `completed` renders none.
  const PHASE_HEADERS = {
    choose: 'Choose a headline',
    predict: 'Make your prediction',
    reveal: 'Round result',
  } as const;
  const ALL_PHASE_HEADERS: readonly string[] = Object.values(PHASE_HEADERS);

  // Interactive-control roles OTHER than 'button'. The spec requires every
  // interactive control to be a button, so none of these should ever appear.
  const NON_BUTTON_INTERACTIVE_ROLES: readonly string[] = [
    'link',
    'switch',
    'checkbox',
    'radio',
    'menuitem',
    'tab',
    'togglebutton',
  ];

  type RenderResult = Awaited<ReturnType<typeof render>>;
  type Phase = 'choose' | 'predict' | 'reveal';

  /** Read the current `Round N of M` as a 1-based pair, or null if absent. */
  function readRound(view: RenderResult): { n: number; m: number } | null {
    const node = view.queryByText(ROUND_PATTERN);
    if (!node) return null;
    const text = Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children);
    const match = ROUND_PATTERN.exec(text);
    if (!match) return null;
    return { n: Number(match[1]), m: Number(match[2]) };
  }

  /** The current phase inferred purely from which controls are rendered. */
  function currentPhase(view: RenderResult): Phase | 'completed' {
    if (view.queryByText(RESULT_PATTERN)) return 'reveal';
    if (view.queryByRole('button', { name: UP_LABEL })) return 'predict';
    if (view.queryAllByRole('button', { name: HEADLINE_PATTERN }).length > 0) return 'choose';
    return 'completed';
  }

  /** The accessible text of a node, flattening array children. */
  function nodeText(node: { props: { children?: unknown } }): string {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  }

  /**
   * True when `node` or any ancestor carries `accessibilityLiveRegion='polite'`.
   * The reveal text sits inside a polite live region wrapper, so we walk up the
   * parent chain (test-renderer instances expose `parent`) looking for it.
   */
  function hasPoliteAncestor(node: unknown): boolean {
    let current = node as
      | { props?: Record<string, unknown>; parent?: unknown }
      | null
      | undefined;
    while (current) {
      if (current.props?.accessibilityLiveRegion === 'polite') return true;
      current = current.parent as typeof current;
    }
    return false;
  }

  /**
   * Assert the phase-independent accessible invariants that must hold in EVERY
   * reachable phase: button-only interactive controls (7.1), a persistent and
   * correct `Round N of M` (7.4), and exactly one phase header naming the
   * current phase (7.5/7.6).
   */
  function assertCommonSemantics(
    view: RenderResult,
    phase: Phase,
    expectedRound: number,
    totalRounds: number,
  ): void {
    // 7.1: every interactive control is a labelled button, and no non-button
    // interactive control exists. Every button has a non-empty label.
    const buttons = view.queryAllByRole('button');
    for (const button of buttons) {
      const label = button.props.accessibilityLabel;
      expect(typeof label).toBe('string');
      expect((label as string).length).toBeGreaterThan(0);
    }
    for (const role of NON_BUTTON_INTERACTIVE_ROLES) {
      expect(view.queryAllByRole(role as never)).toHaveLength(0);
    }

    // 7.4: the accessible round counter is present and correct for this round.
    const round = readRound(view);
    expect(round).not.toBeNull();
    expect(round).toEqual({ n: expectedRound, m: totalRounds });

    // 7.5/7.6: exactly one phase header, naming the current phase. Count only
    // header-role nodes whose text is one of the three phase-header labels (the
    // tree has other headers — the collectible subject, the round counter — so
    // we filter to the phase-header set rather than counting all headers).
    const headerNodes = view.queryAllByRole('header');
    const phaseHeaderTexts = headerNodes
      .map(nodeText)
      .filter((text) => ALL_PHASE_HEADERS.includes(text));
    expect(phaseHeaderTexts).toHaveLength(1);
    expect(phaseHeaderTexts[0]).toBe(PHASE_HEADERS[phase]);
  }

  /**
   * Assert the choose-phase semantics: every authored headline is a labelled
   * `Play headline: <full text>` button whose label contains the complete text
   * (7.2), and no prediction/continue controls exist yet.
   */
  function assertChooseSemantics(view: RenderResult, headlines: readonly { text: string }[]): void {
    const cards = view.queryAllByRole('button', { name: HEADLINE_PATTERN });
    expect(cards).toHaveLength(headlines.length);
    for (const headline of headlines) {
      const expectedLabel = `Play headline: ${headline.text}`;
      const card = view.getByRole('button', { name: expectedLabel });
      // 7.2: the full headline text is contained in the control's label.
      expect(String(card.props.accessibilityLabel)).toContain(headline.text);
    }
    // The predict/continue controls are not present in `choose`.
    expect(view.queryByRole('button', { name: UP_LABEL })).toBeNull();
    expect(view.queryByRole('button', { name: DOWN_LABEL })).toBeNull();
    expect(view.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
    expect(view.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
  }

  /**
   * Assert the predict-phase semantics: exactly the two direction controls are
   * present and their labels explicitly say the price will go "up" / "down"
   * (7.3). No headline cards and no result are shown.
   */
  function assertPredictSemantics(view: RenderResult): void {
    const up = view.getByRole('button', { name: UP_LABEL });
    const down = view.getByRole('button', { name: DOWN_LABEL });
    // 7.3: explicit directional wording in each label.
    expect(String(up.props.accessibilityLabel).toLowerCase()).toContain('up');
    expect(String(down.props.accessibilityLabel).toLowerCase()).toContain('down');
    // The chooser is gone and no result is revealed in `predict`.
    expect(view.queryAllByRole('button', { name: HEADLINE_PATTERN })).toHaveLength(0);
    expect(view.queryByText(RESULT_PATTERN)).toBeNull();
  }

  /**
   * Assert the reveal-phase semantics (7.7): the persistent result text is
   * present (both the legacy `The price moved ...` line and the richer
   * `Price rose/fell/held from ...` copy) and lives inside a polite live region.
   * The direction controls are gone, and exactly one continue control (next on a
   * non-final round, finish on the final round) is exposed.
   */
  function assertRevealSemantics(view: RenderResult, isFinalRound: boolean): void {
    // The persistent legacy line and the richer result line are both present.
    const legacy = view.getByText(RESULT_PATTERN);
    const resultLine = view.getByText(RESULT_LINE_PATTERN);
    // 7.7: the result text survives inside a polite live region (on the node or
    // an ancestor). The persistent text must exist regardless of any imperative
    // announcement, which this already proves by querying it directly.
    expect(hasPoliteAncestor(legacy)).toBe(true);
    expect(hasPoliteAncestor(resultLine)).toBe(true);

    // The prediction pair is locked away once revealed.
    expect(view.queryByRole('button', { name: UP_LABEL })).toBeNull();
    expect(view.queryByRole('button', { name: DOWN_LABEL })).toBeNull();

    // Exactly the correct continue control is exposed for this round.
    if (isFinalRound) {
      expect(view.getByRole('button', { name: FINISH_LABEL })).toBeTruthy();
      expect(view.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
    } else {
      expect(view.getByRole('button', { name: NEXT_LABEL })).toBeTruthy();
      expect(view.queryByRole('button', { name: FINISH_LABEL })).toBeNull();
    }
  }

  /** One generated valid session: raw params/seed and a per-round plan. */
  interface GeneratedSession {
    params: {
      startPriceCents: number;
      baseDemand: number;
      baseSupply: number;
      sensitivity: number;
      noise: number;
      rounds: number;
      headlines: { id: string; text: string; demandDelta: number; supplyDelta: number }[];
    };
    seed: number;
    /** Per round: index into `headlines` and the predicted direction. */
    plan: { headlineIndex: number; prediction: 'up' | 'down' }[];
    label: string;
  }

  /**
   * Build one valid generated session from a seeded RNG: 2-4 distinct headline
   * cards with unique full text (so the `Play headline: <text>` labels never
   * collide), 1..5 rounds, a uint32 seed, noise sometimes on, and a per-round
   * plan choosing a headline and a prediction. The label is folded into each
   * headline's text to keep text unique across cases while staying replayable.
   */
  function generateSession(rng: Rng, label: string): GeneratedSession {
    const safeLabel = label.replace(/[^a-zA-Z0-9]/g, '');
    const headlineCount = randomInt(rng, 2, 4);
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => ({
      id: `h${i}`,
      // Unique, non-empty full text per card so labels are unambiguous.
      text: `Headline ${i} ${safeLabel}`,
      // Deltas span bull/bear/neutral so directions vary across the plan.
      demandDelta: randomInt(rng, -500, 500),
      supplyDelta: randomInt(rng, -500, 500),
    }));
    const rounds = randomInt(rng, 1, 5);
    const seed = randomInt(rng, 0, 0xffffffff);
    const plan = Array.from({ length: rounds }, () => ({
      headlineIndex: randomInt(rng, 0, headlineCount - 1),
      prediction: (rng() < 0.5 ? 'up' : 'down') as 'up' | 'down',
    }));
    return {
      params: {
        startPriceCents: randomInt(rng, 100, 1_000_000),
        baseDemand: randomInt(rng, 0, 1000),
        baseSupply: randomInt(rng, 0, 1000),
        sensitivity: rng() * 0.5,
        noise: rng() < 0.5 ? 0 : rng() * 0.05,
        rounds,
        headlines,
      },
      seed,
      plan,
      label,
    };
  }

  /**
   * Render one generated session and walk it round by round. At every reachable
   * phase (choose, predict, reveal) assert the full accessible-semantics
   * contract, then drive the planned transition. The traversal is deterministic
   * from the generated plan, which is itself derived from the case seed.
   */
  async function checkSession(session: GeneratedSession): Promise<void> {
    const { params, seed, plan, label } = session;
    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={params} seed={seed} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      for (let i = 0; i < plan.length; i++) {
        const step = session.plan[i];
        const expectedRound = i + 1;
        const isFinalRound = i === plan.length - 1;
        const headlineText = params.headlines[step.headlineIndex].text;

        // --- choose phase ---
        expect(currentPhase(view)).toBe('choose');
        assertCommonSemantics(view, 'choose', expectedRound, params.rounds);
        assertChooseSemantics(view, params.headlines);

        // Transition: select the planned headline.
        fireEvent.press(view.getByRole('button', { name: `Play headline: ${headlineText}` }));

        // --- predict phase ---
        await view.findByRole('button', { name: UP_LABEL });
        expect(currentPhase(view)).toBe('predict');
        assertCommonSemantics(view, 'predict', expectedRound, params.rounds);
        assertPredictSemantics(view);

        // Transition: commit the planned prediction.
        const predictLabel = step.prediction === 'up' ? UP_LABEL : DOWN_LABEL;
        fireEvent.press(view.getByRole('button', { name: predictLabel }));

        // --- reveal phase ---
        await view.findByText(RESULT_PATTERN);
        expect(currentPhase(view)).toBe('reveal');
        assertCommonSemantics(view, 'reveal', expectedRound, params.rounds);
        assertRevealSemantics(view, isFinalRound);

        // Transition: advance to the next round, or finish on the final round.
        if (isFinalRound) {
          fireEvent.press(view.getByRole('button', { name: FINISH_LABEL }));
        } else {
          fireEvent.press(view.getByRole('button', { name: NEXT_LABEL }));
          await view.findByText(`Round ${expectedRound + 1} of ${params.rounds}`);
        }
      }

      // The session completed exactly once; `completed` renders no phase header.
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      const headerNodes = view.queryAllByRole('header');
      const phaseHeaderTexts = headerNodes
        .map(nodeText)
        .filter((text) => ALL_PHASE_HEADERS.includes(text));
      expect(phaseHeaderTexts).toHaveLength(0);
    } catch (error) {
      throw new Error(`case ${label} failed its accessibility-semantics assertions: ${String(error)}`);
    } finally {
      view.unmount();
    }
  }

  // One top-level generation seed makes the whole run reproducible from a single
  // number; each case's label also carries its own derived seed for replay.
  const P13_GENERATION_SEED = 0x1d3a7f2;
  const P13_GENERATED_CASES = 120;

  const p13Cases: GeneratedSession[] = (() => {
    const seedRng = mulberry32(P13_GENERATION_SEED);
    const cases: GeneratedSession[] = [];
    for (let i = 0; i < P13_GENERATED_CASES; i++) {
      const caseSeed = randomInt(seedRng, 0, 0xffffffff);
      const rng = mulberry32(caseSeed);
      const label = `seed=${P13_GENERATION_SEED} case#${i} caseSeed=${caseSeed}`;
      cases.push(generateSession(rng, label));
    }
    return cases;
  })();

  // Explicit boundary fixtures pinning the corners the generator may or may not
  // hit on a given run: a single-round session (choose -> predict -> reveal ->
  // finish with no `next`), a two-headline deck, and a four-headline multi-round
  // deck that exercises the `next` transition and the maximum card count.
  const p13Fixtures: GeneratedSession[] = [
    {
      params: {
        startPriceCents: 10000,
        baseDemand: 50,
        baseSupply: 50,
        sensitivity: 0.2,
        noise: 0,
        rounds: 1,
        headlines: [
          { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
          { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
        ],
      },
      seed: 1,
      plan: [{ headlineIndex: 0, prediction: 'up' }],
      label: 'fixture:single-round-two-cards',
    },
    {
      params: {
        startPriceCents: 10000,
        baseDemand: 50,
        baseSupply: 50,
        sensitivity: 0.2,
        noise: 0,
        rounds: 3,
        headlines: [
          { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
          { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
          { id: 'mild-bull', text: 'Analyst upgrade', demandDelta: 10, supplyDelta: 0 },
          { id: 'mild-bear', text: 'Supply glut', demandDelta: 0, supplyDelta: 10 },
        ],
      },
      seed: 7,
      plan: [
        { headlineIndex: 0, prediction: 'up' },
        { headlineIndex: 1, prediction: 'down' },
        { headlineIndex: 2, prediction: 'up' },
      ],
      label: 'fixture:three-round-four-cards',
    },
  ];

  it.each(p13Fixtures.map((c) => [c.label, c] as const))(
    'preserves accessible semantics across every phase for boundary fixture %s',
    async (_label, session) => {
      await checkSession(session);
    },
  );

  it.each(p13Cases.map((c) => [c.label, c] as const))(
    'preserves accessible semantics across every phase for generated session %s',
    async (_label, session) => {
      await checkSession(session);
    },
  );
});

// Feature: interactive-auction-room, Property 14: Motion preference cannot change auction behavior
//
// A learner's OS "reduce motion" setting is a presentation-only preference: it
// may change HOW the reveal animates, but it must never change WHAT the auction
// does (requirements 2.6, 6.1, 6.3, 7.4, 7.5). We prove this by replaying each
// generated session across every motion/animation variant:
//
//   motion preference:  reduced-motion ON  vs  OFF
//   animation callback:  completed (the start() callback fires)
//                        vs interrupted (the start() callback never fires)
//
// and asserting that EVERY variant produces exactly the same observable domain
// output. The common reference each variant is compared against is the pure,
// motion-agnostic `scoreAuction` oracle fed the identical params, seed, and
// choices: the live final price (the revealed price of the last round) must
// equal the oracle's final price, and the live `onComplete({ score, summary })`
// must equal the oracle's score/summary. Because all four variants of a session
// are compared against the SAME oracle, equality to the oracle proves the four
// variants are equal to each other — the reveal animation and the motion
// preference cannot have changed any domain value, the round progression, the
// history, or the completion count.
//
// Each variant also asserts the per-round observable reveal output directly
// (current/revealed prices, signed-cent copy, result line, movement/direction
// line, and which continue control is present), that `onComplete` fires EXACTLY
// once, and that an interrupted / never-completing animation clock never blocks
// the next/finish tap or changes the history.
//
// The reduced-motion contract is proven directly (requirement 7.5): with the
// preference ON the component starts NO timing animation across the whole run
// (`Animated.timing` is never called — it snaps to the final presentation);
// with motion allowed it starts at least one timing animation per revealed
// round. So the two paths are genuinely different in presentation while
// identical in domain output.
//
// Why one render per `it.each` case: the hoisted `useReduceMotion` mock returns
// a static value with no effect, so the reveal's real `Animated` work would, if
// multiple sessions were rendered inside one test, leak animation frames across
// renders and interleave act() scopes. Mirroring Property 11, each case renders
// exactly one session in its own React root, and we expand every session into
// one case per variant. The per-run `Animated.timing/parallel/sequence` stub
// makes the animation inert and controllable (completed vs interrupted) and
// counts timing starts; `useReduceMotion` is toggled per case. Sessions are
// generated dependency-free with `mulberry32`/`randomInt` (no fast-check); at
// least 100 sessions run (×4 variants), and the generation seed, per-case seed,
// and variant name are in every failure label for replay.
describe('<Auction /> — Property 14: motion preference cannot change auction behavior (requirements 2.6, 6.1, 6.3, 7.4, 7.5)', () => {
  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';
  const RESULT_PATTERN = /The price moved/;
  const RESULT_LINE_PATTERN = /Price (rose|fell|held) from .* to .* \(.*\)\./;
  const DIRECTION_PATTERN = /^Price (increase|decrease|no change) \(.*\) · direction (up|down)$/;
  const PRICE_PATTERN = /^\$[\d,]+(\.\d{2})?$/;
  const ROUND_PATTERN = /^Round (\d+) of (\d+)$/;

  // The SAME `Animated` the component imports (not `requireActual`), so spying on
  // its `timing`/`parallel`/`sequence` and on `Animated.Value.prototype`
  // intercepts the reveal animation's real calls.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Animated } = require('react-native') as typeof import('react-native');

  // The ORIGINAL, unwrapped `mulberry32`, so the oracle is built from an
  // independently-seeded stream identical to the one the component builds
  // internally from the same seed.
  const realMulberry32 = rngModule.mulberry32;

  type RenderResult = Awaited<ReturnType<typeof render>>;

  /** The two animation-completion variants crossed with the two motion prefs. */
  interface Variant {
    reduceMotion: boolean;
    completeCallbacks: boolean;
    name: string;
  }
  const VARIANTS: readonly Variant[] = [
    { reduceMotion: false, completeCallbacks: true, name: 'motion-on/anim-completed' },
    { reduceMotion: false, completeCallbacks: false, name: 'motion-on/anim-interrupted' },
    { reduceMotion: true, completeCallbacks: true, name: 'motion-off/anim-completed' },
    { reduceMotion: true, completeCallbacks: false, name: 'motion-off/anim-interrupted' },
  ];

  /**
   * The observable domain snapshot of one reveal, read purely from the UI.
   * Everything here is derived from the committed round result and MUST be
   * identical regardless of motion preference or animation completion.
   */
  interface RevealSnapshot {
    round: number;
    totalRounds: number;
    currentPrice: string;
    legacyLine: string;
    resultLine: string;
    directionLine: string;
    control: 'next' | 'finish';
  }

  /** The flattened text of a matched node. */
  function textOf(node: { props: { children?: unknown } }): string {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  }

  /** Read the current `Round N of M` as a 1-based pair, or null if absent. */
  function readRound(view: RenderResult): { n: number; m: number } | null {
    const node = view.queryByText(ROUND_PATTERN);
    if (!node) return null;
    const match = ROUND_PATTERN.exec(textOf(node));
    if (!match) return null;
    return { n: Number(match[1]), m: Number(match[2]) };
  }

  /** The single current-price text (`$…`) shown at the top of the market stage. */
  function readCurrentPrice(view: RenderResult): string {
    const nodes = view.queryAllByText(PRICE_PATTERN);
    expect(nodes.length).toBeGreaterThan(0);
    return textOf(nodes[0]);
  }

  /** Snapshot the full observable domain output of the current reveal. */
  function snapshotReveal(view: RenderResult): RevealSnapshot {
    const round = readRound(view);
    expect(round).not.toBeNull();
    const control: 'next' | 'finish' = view.queryByRole('button', { name: FINISH_LABEL })
      ? 'finish'
      : 'next';
    return {
      round: round!.n,
      totalRounds: round!.m,
      currentPrice: readCurrentPrice(view),
      legacyLine: textOf(view.getByText(RESULT_PATTERN)),
      resultLine: textOf(view.getByText(RESULT_LINE_PATTERN)),
      directionLine: textOf(view.getByText(DIRECTION_PATTERN)),
      control,
    };
  }

  /** One generated valid session: raw params/seed and a per-round plan. */
  interface GeneratedSession {
    params: {
      startPriceCents: number;
      baseDemand: number;
      baseSupply: number;
      sensitivity: number;
      noise: number;
      rounds: number;
      headlines: { id: string; text: string; demandDelta: number; supplyDelta: number }[];
    };
    seed: number;
    /** Per round: index into `headlines` and the predicted direction. */
    plan: { headlineIndex: number; prediction: 'up' | 'down' }[];
    label: string;
  }

  /**
   * Build one valid generated session from a seeded RNG: 2-4 distinct headline
   * cards with unique full text (so the `Play headline: <text>` labels never
   * collide), 1..5 rounds, a uint32 seed, noise sometimes on, and a per-round
   * plan choosing a headline and a prediction.
   */
  function generateSession(rng: Rng, label: string): GeneratedSession {
    const safeLabel = label.replace(/[^a-zA-Z0-9]/g, '');
    const headlineCount = randomInt(rng, 2, 4);
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => ({
      id: `h${i}`,
      text: `Headline ${i} ${safeLabel}`,
      // Deltas span bull/bear/neutral so directions vary across the plan.
      demandDelta: randomInt(rng, -500, 500),
      supplyDelta: randomInt(rng, -500, 500),
    }));
    const rounds = randomInt(rng, 1, 5);
    const seed = randomInt(rng, 0, 0xffffffff);
    const plan = Array.from({ length: rounds }, () => ({
      headlineIndex: randomInt(rng, 0, headlineCount - 1),
      prediction: (rng() < 0.5 ? 'up' : 'down') as 'up' | 'down',
    }));
    return {
      params: {
        startPriceCents: randomInt(rng, 100, 1_000_000),
        baseDemand: randomInt(rng, 0, 1000),
        baseSupply: randomInt(rng, 0, 1000),
        sensitivity: rng() * 0.5,
        noise: rng() < 0.5 ? 0 : rng() * 0.05,
        rounds,
        headlines,
      },
      seed,
      plan,
      label,
    };
  }

  /**
   * Install an inert, controllable animation for one render. The returned
   * animation's `start(callback)` fires its callback synchronously when
   * `completeCallbacks` is true (a completed animation) and never when it is
   * false (an interrupted animation torn down before settling); `stop()` is a
   * no-op. The reveal effect's `setValue`/`stopAnimation` on real
   * `Animated.Value` instances are made inert too, so no animation ever drives a
   * React update outside act() — all presentation-only, so this cannot change a
   * single domain value (exactly the invariant under test). `interpolate` stays
   * intact so `Animated.View` still renders. A spy on `timing` records whether a
   * timing animation was ever started. Restores everything via the cleanup.
   */
  function installAnimatedStub(completeCallbacks: boolean): {
    timingSpy: jest.SpyInstance;
    restore: () => void;
  } {
    const makeAnim = () => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        if (completeCallbacks && typeof callback === 'function') {
          callback({ finished: true });
        }
        // Interrupted: the callback is simply never invoked.
      },
      stop: () => {},
      reset: () => {},
    });
    const timingSpy = jest
      .spyOn(Animated, 'timing')
      .mockImplementation(() => makeAnim() as unknown as ReturnType<typeof Animated.timing>);
    const parallelSpy = jest
      .spyOn(Animated, 'parallel')
      .mockImplementation(() => makeAnim() as unknown as ReturnType<typeof Animated.parallel>);
    const sequenceSpy = jest
      .spyOn(Animated, 'sequence')
      .mockImplementation(() => makeAnim() as unknown as ReturnType<typeof Animated.sequence>);
    const valueProto = Animated.Value.prototype as unknown as {
      setValue: (value: number) => void;
      stopAnimation: (callback?: (value: number) => void) => void;
    };
    const setValueSpy = jest.spyOn(valueProto, 'setValue').mockImplementation(() => {});
    const stopAnimationSpy = jest
      .spyOn(valueProto, 'stopAnimation')
      .mockImplementation(() => {});
    return {
      timingSpy,
      restore: () => {
        timingSpy.mockRestore();
        parallelSpy.mockRestore();
        sequenceSpy.mockRestore();
        setValueSpy.mockRestore();
        stopAnimationSpy.mockRestore();
      },
    };
  }

  /**
   * Drive one planned round through the live UI: choose the planned headline,
   * commit the planned prediction, snapshot the revealed domain output, then
   * advance (next) or finish. Awaits each phase transition so act() scopes never
   * overlap. The result text and the continue control are queried BEFORE pressing
   * — proving the domain-visible output exists regardless of animation timing —
   * and the continue tap succeeds even for an interrupted animation clock.
   */
  async function playPlannedRound(
    view: RenderResult,
    session: GeneratedSession,
    roundIndex: number,
    last: boolean,
  ): Promise<RevealSnapshot> {
    const step = session.plan[roundIndex];
    const headlineText = session.params.headlines[step.headlineIndex].text;
    fireEvent.press(view.getByRole('button', { name: `Play headline: ${headlineText}` }));
    const predictLabel = step.prediction === 'up' ? UP_LABEL : DOWN_LABEL;
    fireEvent.press(await view.findByRole('button', { name: predictLabel }));

    await view.findByText(RESULT_PATTERN);
    const snapshot = snapshotReveal(view);
    const continueLabel = last ? FINISH_LABEL : NEXT_LABEL;
    const control = await view.findByRole('button', { name: continueLabel });
    fireEvent.press(control);
    return snapshot;
  }

  /**
   * Render and fully replay one session under a fixed motion/animation variant,
   * then assert its observable domain output against the pure, motion-agnostic
   * `scoreAuction` oracle fed the same params, seed, and choices. Because every
   * variant is compared against the SAME oracle, agreement across variants is
   * established transitively: the motion preference and the reveal animation
   * cannot have changed any domain value, the round progression, the history, or
   * the completion count. Also asserts the reduced-motion timing contract
   * (requirement 7.5): no timing animation with reduced motion, at least one per
   * round with motion allowed.
   */
  async function checkVariant(session: GeneratedSession, variant: Variant): Promise<void> {
    const { params, seed, plan, label } = session;
    mockUseReduceMotion.mockReturnValue(variant.reduceMotion);
    const { timingSpy, restore } = installAnimatedStub(variant.completeCallbacks);
    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={params} seed={seed} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      const history: RevealSnapshot[] = [];
      for (let i = 0; i < plan.length; i++) {
        const last = i === plan.length - 1;
        history.push(await playPlannedRound(view, session, i, last));
        if (!last) {
          await view.findByText(`Round ${i + 2} of ${params.rounds}`);
        }
      }

      // onComplete fired EXACTLY once for this full run, regardless of motion /
      // animation completion.
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      const payload = onComplete.mock.calls[0][0] as { score: number; summary: string };

      // One reveal snapshot per planned round — the full committed history is
      // observed, its round counter advancing 1..rounds.
      expect(history).toHaveLength(plan.length);
      history.forEach((snapshot, i) => {
        expect(snapshot.round).toBe(i + 1);
        expect(snapshot.totalRounds).toBe(params.rounds);
        expect(snapshot.control).toBe(i === plan.length - 1 ? 'finish' : 'next');
      });

      // Build the motion-agnostic oracle from the SAME choices and a fresh,
      // unwrapped generator. Every variant is compared against this one
      // reference, so all variants are transitively equal.
      const choices: AuctionChoice[] = plan.map((step) => ({
        headlineId: params.headlines[step.headlineIndex].id,
        prediction: step.prediction,
      }));
      const oracle = scoreAuction(parseAuctionParams(params), choices, realMulberry32(seed));

      // Requirements 6.1/6.3: identical seed + choices => identical outcome, and
      // the motion preference / animation cannot change it.
      expect(payload.score).toBe(oracle.score);
      expect(payload.summary).toBe(oracle.summary);
      // The last reveal's current price equals the oracle's final price — the
      // strongest observable equivalence of the seeded price path.
      expect(history[history.length - 1].currentPrice).toBe(formatDollars(oracle.finalPriceCents));

      // Requirement 7.5: reduced motion starts NO timing animation across the
      // whole run; motion allowed starts at least one per revealed round. All
      // reveal effects have flushed by the time completion settled above.
      if (variant.reduceMotion) {
        expect(timingSpy).not.toHaveBeenCalled();
      } else {
        expect(timingSpy.mock.calls.length).toBeGreaterThanOrEqual(plan.length);
      }
    } catch (error) {
      throw new Error(
        `case ${label} [${variant.name}] failed its motion-invariance assertions: ${String(error)}`,
      );
    } finally {
      view.unmount();
      restore();
    }
  }

  // Reset the mocked motion preference to the file-global default after every
  // case so no other describe block ever sees a leaked `true`. The Animated
  // stubs are installed/restored per render inside `checkVariant`.
  afterEach(() => {
    mockUseReduceMotion.mockReturnValue(false);
  });

  // One top-level generation seed makes the whole run reproducible from a single
  // number; each case's label also carries its own derived seed for replay.
  const P14_GENERATION_SEED = 0x6e2b19d;
  const P14_GENERATED_SESSIONS = 110;

  const p14Sessions: GeneratedSession[] = (() => {
    const seedRng = mulberry32(P14_GENERATION_SEED);
    const sessions: GeneratedSession[] = [];
    for (let i = 0; i < P14_GENERATED_SESSIONS; i++) {
      const caseSeed = randomInt(seedRng, 0, 0xffffffff);
      const rng = mulberry32(caseSeed);
      const label = `seed=${P14_GENERATION_SEED} case#${i} caseSeed=${caseSeed}`;
      sessions.push(generateSession(rng, label));
    }
    return sessions;
  })();

  // Explicit boundary fixtures pinning the corners the generator may or may not
  // hit on a given run: a single-round session (no `next`, straight to finish),
  // a multi-round two-card deck, and a four-card multi-round deck with noise on.
  const p14Fixtures: GeneratedSession[] = [
    {
      params: {
        startPriceCents: 10000,
        baseDemand: 50,
        baseSupply: 50,
        sensitivity: 0.2,
        noise: 0,
        rounds: 1,
        headlines: [
          { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
          { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
        ],
      },
      seed: 1,
      plan: [{ headlineIndex: 0, prediction: 'up' }],
      label: 'fixture:single-round-two-cards',
    },
    {
      params: {
        startPriceCents: 10000,
        baseDemand: 50,
        baseSupply: 50,
        sensitivity: 0.2,
        noise: 0,
        rounds: 3,
        headlines: [
          { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
          { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
        ],
      },
      seed: 7,
      plan: [
        { headlineIndex: 0, prediction: 'up' },
        { headlineIndex: 1, prediction: 'down' },
        { headlineIndex: 0, prediction: 'down' },
      ],
      label: 'fixture:three-round-two-cards',
    },
    {
      params: {
        startPriceCents: 25000,
        baseDemand: 120,
        baseSupply: 80,
        sensitivity: 0.3,
        noise: 0.03,
        rounds: 2,
        headlines: [
          { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
          { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
          { id: 'mild-bull', text: 'Analyst upgrade', demandDelta: 10, supplyDelta: 0 },
          { id: 'mild-bear', text: 'Supply glut', demandDelta: 0, supplyDelta: 10 },
        ],
      },
      seed: 42,
      plan: [
        { headlineIndex: 2, prediction: 'up' },
        { headlineIndex: 3, prediction: 'down' },
      ],
      label: 'fixture:two-round-four-cards-noise',
    },
  ];

  // Expand every session into one case per variant: one render per `it.each`
  // case (its own React root), mirroring Property 11, so the reveal animation of
  // one render never leaks into another.
  function expand(
    sessions: GeneratedSession[],
  ): (readonly [string, GeneratedSession, Variant])[] {
    const cases: (readonly [string, GeneratedSession, Variant])[] = [];
    for (const session of sessions) {
      for (const variant of VARIANTS) {
        cases.push([`${session.label} [${variant.name}]`, session, variant] as const);
      }
    }
    return cases;
  }

  it.each(expand(p14Fixtures))(
    'keeps auction behavior identical to the motion-agnostic oracle for %s',
    async (_label, session, variant) => {
      await checkVariant(session, variant);
    },
  );

  it.each(expand(p14Sessions))(
    'keeps auction behavior identical to the motion-agnostic oracle for %s',
    async (_label, session, variant) => {
      await checkVariant(session, variant);
    },
  );
});

// Task 7.4: Focused accessibility and animation-failure regressions
//
// Property 14 proves motion preference and animation completion cannot change
// behavior across 100+ generated sessions. These focused example tests pin the
// specific failure modes directly and legibly, reusing the file-global
// `mockUseReduceMotion` hook mock (never redefining it) and the same `Animated`
// instance the component imports:
//
//  - Content is NOT animation-gated: with `Animated.timing` stubbed so its
//    start callback NEVER fires, the full reveal text (`/The price moved/` and
//    the richer `Price rose/fell/held from X to Y (±N¢).` line) is present
//    IMMEDIATELY after the commit, on both the animated (motion on) and static
//    (motion off) paths (requirements 2.6, 7.4).
//  - An interrupted / missing animation clock cannot block progress: with the
//    animation callback never firing, the next and finish controls are still
//    pressable and advance / complete the session normally (requirements 7.4,
//    7.5).
//  - No animation completion callback mutates game state: the committed
//    result / history / score and the emitted `onComplete` payload are identical
//    whether the stubbed animation callback fires (completed) or never fires
//    (interrupted) (requirements 6.1, 6.3).
//  - The screen-reader announcement is strictly best-effort: when BOTH
//    `AccessibilityInfo.announceForAccessibilityWithOptions` and
//    `announceForAccessibility` are absent, a reveal still renders the
//    persistent accessible result, completes once, and makes no speech attempt;
//    when the announcement API THROWS, the reveal still renders the persistent
//    result, does not double-complete, and the error is swallowed (requirement
//    7.7).
describe('<Auction /> — Task 7.4: focused accessibility and animation-failure regressions (requirements 2.6, 6.1, 6.3, 7.4, 7.5, 7.7)', () => {
  const UP_LABEL = 'Predict the price will go up';
  const DOWN_LABEL = 'Predict the price will go down';
  const NEXT_LABEL = 'Go to the next round';
  const FINISH_LABEL = 'See your result';
  const RESULT_PATTERN = /The price moved/;
  const RESULT_LINE_PATTERN = /Price (rose|fell|held) from .* to .* \(.*\)\./;

  // The SAME `Animated` the component imports, so spying on its factories
  // intercepts the reveal animation's real calls (mirrors Property 14).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Animated, AccessibilityInfo } = require('react-native') as typeof import('react-native');

  type RenderResult = Awaited<ReturnType<typeof render>>;

  // A deterministic two-round bull/bear deck. Noise 0 makes every revealed price
  // exact, so the reveal copy is stable and easy to assert.
  const T74_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  /**
   * Install an inert, controllable animation for one render (same shape as
   * Property 14's `installAnimatedStub`). The animation's `start(callback)` fires
   * its callback synchronously when `completeCallbacks` is true (a completed
   * animation) and NEVER when it is false (an interrupted / missing clock);
   * `stop`/`reset` are no-ops. `Animated.Value.prototype.setValue` and
   * `stopAnimation` are made inert so no animation drives a React update outside
   * act(); `interpolate` stays intact so `Animated.View` still renders. Restores
   * everything via the returned cleanup.
   */
  function installAnimatedStub(completeCallbacks: boolean): {
    timingSpy: jest.SpyInstance;
    restore: () => void;
  } {
    const makeAnim = () => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        if (completeCallbacks && typeof callback === 'function') {
          callback({ finished: true });
        }
        // Interrupted / missing clock: the callback is simply never invoked.
      },
      stop: () => {},
      reset: () => {},
    });
    const timingSpy = jest
      .spyOn(Animated, 'timing')
      .mockImplementation(() => makeAnim() as unknown as ReturnType<typeof Animated.timing>);
    const parallelSpy = jest
      .spyOn(Animated, 'parallel')
      .mockImplementation(() => makeAnim() as unknown as ReturnType<typeof Animated.parallel>);
    const sequenceSpy = jest
      .spyOn(Animated, 'sequence')
      .mockImplementation(() => makeAnim() as unknown as ReturnType<typeof Animated.sequence>);
    const valueProto = Animated.Value.prototype as unknown as {
      setValue: (value: number) => void;
      stopAnimation: (callback?: (value: number) => void) => void;
    };
    const setValueSpy = jest.spyOn(valueProto, 'setValue').mockImplementation(() => {});
    const stopAnimationSpy = jest
      .spyOn(valueProto, 'stopAnimation')
      .mockImplementation(() => {});
    return {
      timingSpy,
      restore: () => {
        timingSpy.mockRestore();
        parallelSpy.mockRestore();
        sequenceSpy.mockRestore();
        setValueSpy.mockRestore();
        stopAnimationSpy.mockRestore();
      },
    };
  }

  // Reset the file-global motion mock after every case so no leaked `true`
  // reaches another describe block (mirrors Property 14's afterEach). Any
  // per-test spies are torn down with restoreAllMocks.
  afterEach(() => {
    mockUseReduceMotion.mockReturnValue(false);
    jest.restoreAllMocks();
  });

  describe.each([
    ['animated path (motion on)', false],
    ['static path (motion off)', true],
  ])('reveal content exists before the animation completes — %s', (_label, reduceMotion) => {
    it('renders the full result immediately after commit even though the animation callback never fires', async () => {
      mockUseReduceMotion.mockReturnValue(reduceMotion as boolean);
      // Interrupted stub: `start`'s callback never fires, so nothing but the
      // already-rendered result can make the text appear.
      const { restore } = installAnimatedStub(false);
      const onComplete = jest.fn();
      const view = await render(
        <ThemeProvider>
          <Auction params={T74_PARAMS} seed={1} onComplete={onComplete} />
        </ThemeProvider>,
      );

      try {
        fireEvent.press(view.getByRole('button', { name: 'Play headline: Great earnings' }));
        fireEvent.press(await view.findByRole('button', { name: UP_LABEL }));

        // The legacy phrasing AND the richer signed result line are both present
        // as soon as the commit renders — the animation callback has NOT fired
        // (and never will, with the inert stub), so the content cannot be gated
        // on animation timing. Awaiting here resolves only React's commit of the
        // reveal, not any animation clock.
        expect(await view.findByText(RESULT_PATTERN)).toBeTruthy();
        expect(view.getByText(RESULT_LINE_PATTERN)).toBeTruthy();
        // The continue control is already available too.
        expect(view.getByRole('button', { name: NEXT_LABEL })).toBeTruthy();
      } finally {
        view.unmount();
        restore();
      }
    });
  });

  it('an interrupted / missing animation clock cannot block next or finish (requirements 7.4, 7.5)', async () => {
    mockUseReduceMotion.mockReturnValue(false);
    // The animation callback NEVER fires for the whole session.
    const { restore } = installAnimatedStub(false);
    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={T74_PARAMS} seed={1} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      // Round 1: the NEXT control still advances despite the stalled clock.
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Great earnings' }));
      fireEvent.press(await view.findByRole('button', { name: UP_LABEL }));
      fireEvent.press(await view.findByRole('button', { name: NEXT_LABEL }));
      await view.findByText('Round 2 of 2');

      // Round 2: the FINISH control still completes despite the stalled clock.
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Factory fire' }));
      fireEvent.press(await view.findByRole('button', { name: DOWN_LABEL }));
      fireEvent.press(await view.findByRole('button', { name: FINISH_LABEL }));

      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    } finally {
      view.unmount();
      restore();
    }
  });

  /** The flattened text of the richer result line currently rendered. */
  function textOfResultLine(view: RenderResult): string {
    const node = view.getByText(RESULT_LINE_PATTERN);
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  }

  /**
   * Play the full two-round T74 session once under a fixed animation-completion
   * variant and return the committed outcome observed purely from the UI /
   * `onComplete`. `completeCallbacks` toggles whether the stubbed animation's
   * start callback fires (completed) or never fires (interrupted). The committed
   * result / history / score MUST be identical across both, proving no animation
   * completion callback mutates domain state.
   */
  async function playFullOutcome(
    completeCallbacks: boolean,
  ): Promise<{ score: number; summary: string; finalPrice: string }> {
    mockUseReduceMotion.mockReturnValue(false);
    const { restore } = installAnimatedStub(completeCallbacks);
    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={T74_PARAMS} seed={1} onComplete={onComplete} />
      </ThemeProvider>,
    );
    try {
      // Round 1: bull card, predict up, then advance.
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Great earnings' }));
      fireEvent.press(await view.findByRole('button', { name: UP_LABEL }));
      await view.findByText(RESULT_PATTERN);
      fireEvent.press(await view.findByRole('button', { name: NEXT_LABEL }));
      await view.findByText('Round 2 of 2');

      // Round 2: bear card, predict down, then finish.
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Factory fire' }));
      fireEvent.press(await view.findByRole('button', { name: DOWN_LABEL }));
      const finishButton = await view.findByRole('button', { name: FINISH_LABEL });
      // The final revealed price is on screen before finishing (reveal commit,
      // not any animation clock).
      const finalPrice = textOfResultLine(view);
      fireEvent.press(finishButton);
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      const payload = onComplete.mock.calls[0][0] as { score: number; summary: string };
      return { score: payload.score, summary: payload.summary, finalPrice };
    } finally {
      view.unmount();
      restore();
    }
  }

  it('no animation completion callback mutates committed game state (requirements 6.1, 6.3)', async () => {
    // Play the identical session twice: once with the stubbed animation callback
    // firing (completed), once with it never firing (interrupted). The committed
    // outcome must be identical — a completion callback cannot touch the domain.
    const interrupted = await playFullOutcome(false);
    // Let the first render's unmount cleanup (effect teardown) fully settle on a
    // fresh macrotask before mounting the second session, so the two renders
    // never share an overlapping act() scope.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const completed = await playFullOutcome(true);

    // The firing (completed) and non-firing (interrupted) animation produce the
    // exact same committed outcome.
    expect(completed).toEqual(interrupted);

    // And both match the motion-agnostic pure oracle for the same seed/choices.
    const choices: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
    ];
    const oracle = scoreAuction(parseAuctionParams(T74_PARAMS), choices, mulberry32(1));
    expect(completed.score).toBe(oracle.score);
    expect(completed.summary).toBe(oracle.summary);
  });

  it('a reveal still renders the persistent result and completes once when the announcement API is absent (requirement 7.7)', async () => {
    mockUseReduceMotion.mockReturnValue(false);
    const { restore } = installAnimatedStub(true);

    // Make BOTH announcement entry points absent so feature detection finds
    // neither and no speech attempt is possible.
    const info = AccessibilityInfo as unknown as {
      announceForAccessibilityWithOptions?: unknown;
      announceForAccessibility?: unknown;
    };
    const originalWithOptions = info.announceForAccessibilityWithOptions;
    const originalPlain = info.announceForAccessibility;
    // Delete the properties entirely so the component's `typeof info.method ===
    // 'function'` feature detection is false for BOTH and no speech is ever
    // attempted (there is no callable to invoke).
    delete info.announceForAccessibilityWithOptions;
    delete info.announceForAccessibility;
    expect(typeof info.announceForAccessibilityWithOptions).not.toBe('function');
    expect(typeof info.announceForAccessibility).not.toBe('function');

    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={T74_PARAMS} seed={1} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Great earnings' }));
      fireEvent.press(await view.findByRole('button', { name: UP_LABEL }));

      // The persistent accessible result text is still present with no API.
      expect(await view.findByText(RESULT_PATTERN)).toBeTruthy();
      expect(view.getByText(RESULT_LINE_PATTERN)).toBeTruthy();

      // Finish the session: completion still happens exactly once.
      fireEvent.press(await view.findByRole('button', { name: NEXT_LABEL }));
      await view.findByText('Round 2 of 2');
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Factory fire' }));
      fireEvent.press(await view.findByRole('button', { name: DOWN_LABEL }));
      fireEvent.press(await view.findByRole('button', { name: FINISH_LABEL }));
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    } finally {
      // Restore the original announcement API shape.
      if (originalWithOptions !== undefined) {
        info.announceForAccessibilityWithOptions = originalWithOptions;
      }
      if (originalPlain !== undefined) {
        info.announceForAccessibility = originalPlain;
      }
      view.unmount();
      restore();
    }
  });

  it('a reveal still renders the persistent result without double-completing when the announcement API throws (requirement 7.7)', async () => {
    mockUseReduceMotion.mockReturnValue(false);
    const { restore } = installAnimatedStub(true);

    const info = AccessibilityInfo as unknown as {
      announceForAccessibilityWithOptions?: (
        announcement: string,
        options: { queue?: boolean },
      ) => void;
      announceForAccessibility?: (announcement: string) => void;
    };
    // Make the preferred (and, defensively, the fallback) announcement throw. The
    // component's try/catch must swallow it; the persistent text stays the source
    // of truth.
    const withOptionsSpy = jest
      .spyOn(
        info as Required<typeof info>,
        'announceForAccessibilityWithOptions',
      )
      .mockImplementation(() => {
        throw new Error('announce boom');
      });
    const plainSpy =
      typeof info.announceForAccessibility === 'function'
        ? jest.spyOn(info as Required<typeof info>, 'announceForAccessibility').mockImplementation(() => {
            throw new Error('announce boom');
          })
        : null;

    const onComplete = jest.fn();
    const view = await render(
      <ThemeProvider>
        <Auction params={T74_PARAMS} seed={1} onComplete={onComplete} />
      </ThemeProvider>,
    );

    try {
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Great earnings' }));
      fireEvent.press(await view.findByRole('button', { name: UP_LABEL }));

      // The throwing announcement did not remove the persistent result text.
      expect(await view.findByText(RESULT_PATTERN)).toBeTruthy();
      expect(view.getByText(RESULT_LINE_PATTERN)).toBeTruthy();
      // The preferred announcement was attempted (and threw, and was swallowed).
      expect(withOptionsSpy).toHaveBeenCalled();

      // Finish the session: completion still happens exactly once — the swallowed
      // error neither crashed the reveal nor triggered a second completion.
      fireEvent.press(await view.findByRole('button', { name: NEXT_LABEL }));
      await view.findByText('Round 2 of 2');
      fireEvent.press(view.getByRole('button', { name: 'Play headline: Factory fire' }));
      fireEvent.press(await view.findByRole('button', { name: DOWN_LABEL }));
      fireEvent.press(await view.findByRole('button', { name: FINISH_LABEL }));
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    } finally {
      withOptionsSpy.mockRestore();
      plainSpy?.mockRestore();
      view.unmount();
      restore();
    }
  });
});

// Task 8.1: contract, registry, and prohibited-side-effect smoke tests
// (requirements 1.1, 1.2, 1.3, 1.7, 1.8, 6.4)
//
// These are focused example-based smoke tests, NOT property tests. They protect
// the unchanged lesson integration seam: the `auction` registry entry resolves
// to this exact component, the component honours the shared `SimComponent`
// contract with no extra props, it performs no network or haptics during a full
// run (requirements 1.7, 1.8), and a completed session emits exactly one
// contract-shaped `{ score, summary }` payload equal to the pure `scoreAuction`
// oracle for the same params/seed/choices (requirements 1.3, 6.4).
//
// Verification targets, NOT modification targets: `registry.tsx`, `SimStep.tsx`,
// and the lesson scoring/rewind/analytics modules are asserted against here but
// never changed by this feature. The identity assertions below (same component
// object out of the registry) are what pin that the wiring was not disturbed.
describe('<Auction /> — Task 8.1 lesson integration smoke tests (requirements 1.1, 1.2, 1.3, 1.7, 1.8, 6.4)', () => {
  // A small, fully-known two-round session with noise 0 so the headline alone
  // decides direction and the oracle comparison is exact.
  const SMOKE_PARAMS = {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 2,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
  } as const;

  const SMOKE_SEED = 42;

  // The choices the smoke session plays, mirrored into the oracle input.
  const SMOKE_CHOICES: AuctionChoice[] = [
    { headlineId: 'bull', prediction: 'up' },
    { headlineId: 'bear', prediction: 'up' },
  ];

  describe('registry wiring is unchanged (requirements 1.1, 1.2)', () => {
    it('resolves `auction` to the exact Auction component without mutating the registry', () => {
      // Identity, both through the public lookup and the raw map — the registry
      // still points at THIS component object (not a wrapper or a copy).
      expect(getSimComponent('auction')).toBe(Auction);
      expect(SIM_REGISTRY.auction).toBe(Auction);

      // Reading the registry must not mutate it: the entry is stable across
      // repeated lookups and still identical to the map value.
      expect(getSimComponent('auction')).toBe(SIM_REGISTRY.auction);
    });

    it('is assignable to SimComponent and needs only params/seed/onComplete (no fourth prop)', async () => {
      // Runtime half of the contract check: `Auction` renders with ONLY the
      // three shared props and reaches a usable game state. The compile-time
      // half is the module-scope `const _auctionIsSimComponent: SimComponent`
      // assignment at the top of this file — a fourth required prop would fail
      // `tsc` there. No extra prop is passed here.
      const onComplete = jest.fn();
      const view = await render(
        <ThemeProvider>
          <Auction params={SMOKE_PARAMS} seed={SMOKE_SEED} onComplete={onComplete} />
        </ThemeProvider>,
      );
      try {
        expect(view.getByText('Round 1 of 2')).toBeTruthy();
        expect(
          view.getByRole('button', { name: 'Play headline: Great earnings' }),
        ).toBeTruthy();
        expect(onComplete).not.toHaveBeenCalled();
      } finally {
        view.unmount();
      }
    });
  });

  describe('a full session performs no network or haptics and completes once (requirements 1.3, 1.7, 1.8, 6.4)', () => {
    // Preserve the ambient fetch so it can be restored even if the test throws;
    // tests must not leak a throwing fetch into any later suite.
    const originalFetch = global.fetch;
    let fetchSpy: jest.Mock;
    let hapticSpy: jest.SpyInstance;

    beforeEach(() => {
      // Fail-if-called network seam (requirement 1.7). A pure lesson lab makes
      // no network request; if the component (or anything it reaches) calls
      // `fetch`, this throws and the "never called" assertion below fails.
      fetchSpy = jest.fn(() => {
        throw new Error('auction lab must not perform network requests');
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      // Fail-if-called lesson haptic seam (requirement 1.8). The lab imports no
      // haptics, but spying on the lesson `feedbackHaptic` entry point proves it
      // directly: a call would throw here, and the `expo-haptics` module mock at
      // the top of the file is a second trip wire one level down.
      hapticSpy = jest.spyOn(hapticsModule, 'feedbackHaptic').mockImplementation(() => {
        throw new Error('auction lab must not fire lesson haptics');
      });
    });

    afterEach(() => {
      global.fetch = originalFetch;
      hapticSpy.mockRestore();
    });

    it('emits exactly one contract-shaped, oracle-equivalent completion with no side effects', async () => {
      const onComplete = jest.fn();
      const view = await render(
        <ThemeProvider>
          <Auction params={SMOKE_PARAMS} seed={SMOKE_SEED} onComplete={onComplete} />
        </ThemeProvider>,
      );

      try {
        // Round 1: bull card, predict up. Round 2: bear card, predict up.
        fireEvent.press(view.getByRole('button', { name: 'Play headline: Great earnings' }));
        fireEvent.press(
          await view.findByRole('button', { name: 'Predict the price will go up' }),
        );
        fireEvent.press(await view.findByRole('button', { name: 'Go to the next round' }));

        await view.findByText('Round 2 of 2');

        fireEvent.press(view.getByRole('button', { name: 'Play headline: Factory fire' }));
        fireEvent.press(
          await view.findByRole('button', { name: 'Predict the price will go up' }),
        );
        fireEvent.press(await view.findByRole('button', { name: 'See your result' }));

        // Exactly one completion (requirement 1.3).
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

        // The payload is contract-shaped: numeric 0..100 integer score and a
        // non-empty string summary (SimOutcome).
        const payload = onComplete.mock.calls[0][0] as { score: number; summary: string };
        expect(typeof payload.score).toBe('number');
        expect(Number.isInteger(payload.score)).toBe(true);
        expect(payload.score).toBeGreaterThanOrEqual(0);
        expect(payload.score).toBeLessThanOrEqual(100);
        expect(typeof payload.summary).toBe('string');
        expect(payload.summary.length).toBeGreaterThan(0);

        // Oracle equivalence (requirement 6.4): the live payload equals the pure
        // `scoreAuction` fed the SAME params/seed/choices via a fresh generator.
        const oracle = scoreAuction(
          parseAuctionParams(SMOKE_PARAMS),
          SMOKE_CHOICES,
          mulberry32(SMOKE_SEED),
        );
        expect(payload.score).toBe(oracle.score);
        expect(payload.summary).toBe(oracle.summary);

        // No prohibited side effects anywhere in the full session.
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(hapticSpy).not.toHaveBeenCalled();
      } finally {
        view.unmount();
      }
    });
  });
});

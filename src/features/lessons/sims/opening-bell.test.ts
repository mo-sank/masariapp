/**
 * Tests for the opening-bell pure logic (requirements 8.4, 8.5).
 *
 * The lab's only randomness is the seeded event order; interpretation scoring is
 * a deterministic function of the choices. These tests pin down params
 * validation (including the correct-interpretation refinement), the seeded order
 * (identical across runs, requirement 8.5), the "correct interpretations /
 * events" scoring with the practice action unscored (requirement 8.4), and the
 * edge cases (unknown event, foreign interpretation, empty run).
 */

import {
  orderEvents,
  parseOpeningBellParams,
  scoreOpeningBell,
  secondsPerEvent,
  type OpeningBellChoice,
  type OpeningBellParams,
} from './opening-bell';
import { mulberry32 } from '../rng';

/** A three-event day; each event has a clearly correct reading ("good"/"bad"). */
function makeParams(overrides: Partial<OpeningBellParams> = {}): OpeningBellParams {
  return parseOpeningBellParams({
    symbol: 'ACME',
    durationSeconds: 90,
    events: [
      {
        id: 'e1',
        headline: 'ACME beats earnings',
        interpretations: [
          { id: 'good', text: 'The company made more money than expected' },
          { id: 'bad', text: 'The company is in trouble' },
        ],
        correctInterpretationId: 'good',
        explanation: 'Beating earnings is usually read as good news.',
      },
      {
        id: 'e2',
        headline: 'ACME recalls a product',
        interpretations: [
          { id: 'good', text: 'Nothing to worry about' },
          { id: 'bad', text: 'A costly problem for the company' },
        ],
        correctInterpretationId: 'bad',
        explanation: 'A recall can be expensive and hurt trust.',
      },
      {
        id: 'e3',
        headline: 'ACME opens a new store',
        interpretations: [
          { id: 'good', text: 'A sign of growth' },
          { id: 'bad', text: 'The company is shrinking' },
        ],
        correctInterpretationId: 'good',
        explanation: 'Opening stores usually signals expansion.',
      },
    ],
    ...overrides,
  });
}

describe('parseOpeningBellParams', () => {
  it('defaults the day length to 90 seconds', () => {
    const parsed = parseOpeningBellParams({
      symbol: 'ACME',
      events: makeParams().events,
    });
    expect(parsed.durationSeconds).toBe(90);
  });

  it('rejects an event whose correct interpretation is not an option', () => {
    expect(() =>
      parseOpeningBellParams({
        symbol: 'ACME',
        events: [
          {
            id: 'e1',
            headline: 'News',
            interpretations: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
            ],
            correctInterpretationId: 'c', // not present
            explanation: 'why',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects an event with only one interpretation', () => {
    expect(() =>
      parseOpeningBellParams({
        symbol: 'ACME',
        events: [
          {
            id: 'e1',
            headline: 'News',
            interpretations: [{ id: 'a', text: 'A' }],
            correctInterpretationId: 'a',
            explanation: 'why',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('orderEvents (requirement 8.5)', () => {
  it('is identical across runs with the same seed', () => {
    const params = makeParams();
    const a = orderEvents(params, mulberry32(42));
    const b = orderEvents(params, mulberry32(42));
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it('keeps all events (a permutation, no loss)', () => {
    const params = makeParams();
    const ordered = orderEvents(params, mulberry32(5));
    expect(ordered.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('does not mutate the input events', () => {
    const params = makeParams();
    const before = params.events.map((e) => e.id);
    orderEvents(params, mulberry32(9));
    expect(params.events.map((e) => e.id)).toEqual(before);
  });
});

describe('secondsPerEvent', () => {
  it('splits the day evenly across the events', () => {
    expect(secondsPerEvent(makeParams())).toBe(30); // 90s / 3 events
  });
});

describe('scoreOpeningBell (requirements 8.4, 8.5)', () => {
  it('scores correct interpretations / events as a 0-100 integer', () => {
    const choices: OpeningBellChoice[] = [
      { eventId: 'e1', interpretationId: 'good', action: 'buy' }, // correct
      { eventId: 'e2', interpretationId: 'good', action: 'hold' }, // wrong
      { eventId: 'e3', interpretationId: 'good', action: 'buy' }, // correct
    ];
    const result = scoreOpeningBell(makeParams(), choices);
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.score).toBe(67); // round(2/3 * 100)
  });

  it('does not score the practice action on returns (8.4)', () => {
    // Same (all-correct) interpretations but different actions -> same score.
    const base = makeParams();
    const buyAll: OpeningBellChoice[] = [
      { eventId: 'e1', interpretationId: 'good', action: 'buy' },
      { eventId: 'e2', interpretationId: 'bad', action: 'buy' },
      { eventId: 'e3', interpretationId: 'good', action: 'buy' },
    ];
    const sellAll: OpeningBellChoice[] = buyAll.map((c) => ({ ...c, action: 'sell' }));
    expect(scoreOpeningBell(base, buyAll).score).toBe(100);
    expect(scoreOpeningBell(base, sellAll).score).toBe(100);
  });

  it('records the action taken per event in the result', () => {
    const result = scoreOpeningBell(makeParams(), [
      { eventId: 'e1', interpretationId: 'good', action: 'sell' },
    ]);
    expect(result.events[0]).toMatchObject({ eventId: 'e1', correct: true, action: 'sell' });
  });

  it('throws on a choice for an unknown event', () => {
    expect(() =>
      scoreOpeningBell(makeParams(), [
        { eventId: 'ghost', interpretationId: 'good', action: 'buy' },
      ]),
    ).toThrow(/unknown event/);
  });

  it('throws on an interpretation that is not an option for the event', () => {
    expect(() =>
      scoreOpeningBell(makeParams(), [
        { eventId: 'e1', interpretationId: 'nope', action: 'buy' },
      ]),
    ).toThrow(/not an option/);
  });

  it('scores an empty run as 0', () => {
    const result = scoreOpeningBell(makeParams(), []);
    expect(result.score).toBe(0);
    expect(result.total).toBe(0);
  });
});

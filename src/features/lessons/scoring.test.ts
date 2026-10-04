/**
 * Tests for pure lesson scoring (requirements 5.1, 5.3).
 *
 * Covers each scored step type's correctness rule, the all-or-nothing rule for
 * sort/match, sim score pass-through and clamping, how unscored and unanswered
 * items are treated, the empty-scored-set default, and the pass threshold.
 *
 * Steps are built with the schema's `safeParse` so the per-type `scored`
 * defaults (mcq/truefalse/sort/match default on, predict/sim default off) are
 * applied exactly as they are for real content, rather than hand-asserting them.
 */

import { stepSchema, type Step } from './schema';
import { isPassing, scoreLesson, type Answer } from './scoring';

/** Parse a raw step through the schema so defaults match real content. */
function step(raw: unknown): Step {
  const result = stepSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`test step fixture invalid: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

const mcq = step({
  id: 'q_mcq',
  type: 'mcq',
  prompt: 'Pick A',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  correctId: 'a',
  explanation: 'because',
  concept: 'c',
});

const trueFalse = step({
  id: 'q_tf',
  type: 'truefalse',
  prompt: 'The sky is blue',
  answer: true,
  explanation: 'yes',
  concept: 'c',
});

const predictScored = step({
  id: 'q_predict',
  type: 'predict',
  prompt: 'Guess',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  correctId: 'b',
  reveal: 'it was B',
  scored: true,
  concept: 'c',
});

const sortStep = step({
  id: 'q_sort',
  type: 'sort',
  prompt: 'Sort them',
  buckets: [
    { id: 'x', label: 'X' },
    { id: 'y', label: 'Y' },
  ],
  items: [
    { id: 'i1', text: 'one', bucketId: 'x' },
    { id: 'i2', text: 'two', bucketId: 'y' },
  ],
  explanation: 'done',
  concept: 'c',
});

const matchStep = step({
  id: 'q_match',
  type: 'match',
  prompt: 'Match them',
  pairs: [
    { id: 'p1', left: 'L1', right: 'R1' },
    { id: 'p2', left: 'L2', right: 'R2' },
  ],
  explanation: 'done',
  concept: 'c',
});

const simScored = step({
  id: 'q_sim',
  type: 'sim',
  simId: 'ownership_split',
  goal: 'raise money',
  params: {},
  scored: true,
  concept: 'c',
});

const cards = step({
  id: 's_cards',
  type: 'cards',
  cards: [{ body: 'read me' }],
});

describe('scoreLesson — per-type correctness (requirement 5.1)', () => {
  it('scores a correct mcq as 100 and an incorrect one as 0', () => {
    const correct: Answer = { stepId: 'q_mcq', type: 'mcq', optionId: 'a' };
    const wrong: Answer = { stepId: 'q_mcq', type: 'mcq', optionId: 'b' };
    expect(scoreLesson([mcq], [correct]).scorePct).toBe(100);
    expect(scoreLesson([mcq], [wrong]).scorePct).toBe(0);
  });

  it('scores truefalse against the authored answer', () => {
    expect(
      scoreLesson([trueFalse], [{ stepId: 'q_tf', type: 'truefalse', value: true }]).scorePct,
    ).toBe(100);
    expect(
      scoreLesson([trueFalse], [{ stepId: 'q_tf', type: 'truefalse', value: false }]).scorePct,
    ).toBe(0);
  });

  it('scores a scored predict step against correctId', () => {
    expect(
      scoreLesson([predictScored], [{ stepId: 'q_predict', type: 'predict', optionId: 'b' }])
        .scorePct,
    ).toBe(100);
    expect(
      scoreLesson([predictScored], [{ stepId: 'q_predict', type: 'predict', optionId: 'a' }])
        .scorePct,
    ).toBe(0);
  });

  it('scores sort all-or-nothing', () => {
    const perfect: Answer = {
      stepId: 'q_sort',
      type: 'sort',
      placements: { i1: 'x', i2: 'y' },
    };
    const oneWrong: Answer = {
      stepId: 'q_sort',
      type: 'sort',
      placements: { i1: 'x', i2: 'x' },
    };
    expect(scoreLesson([sortStep], [perfect]).scorePct).toBe(100);
    expect(scoreLesson([sortStep], [oneWrong]).scorePct).toBe(0);
  });

  it('scores match all-or-nothing', () => {
    const perfect: Answer = {
      stepId: 'q_match',
      type: 'match',
      pairings: { p1: 'R1', p2: 'R2' },
    };
    const oneWrong: Answer = {
      stepId: 'q_match',
      type: 'match',
      pairings: { p1: 'R1', p2: 'R1' },
    };
    expect(scoreLesson([matchStep], [perfect]).scorePct).toBe(100);
    expect(scoreLesson([matchStep], [oneWrong]).scorePct).toBe(0);
  });

  it('passes a scored sim score through and clamps it to 0-100', () => {
    expect(scoreLesson([simScored], [{ stepId: 'q_sim', type: 'sim', score: 60 }]).scorePct).toBe(
      60,
    );
    expect(scoreLesson([simScored], [{ stepId: 'q_sim', type: 'sim', score: 150 }]).scorePct).toBe(
      100,
    );
    expect(scoreLesson([simScored], [{ stepId: 'q_sim', type: 'sim', score: -5 }]).scorePct).toBe(0);
    expect(
      scoreLesson([simScored], [{ stepId: 'q_sim', type: 'sim', score: NaN }]).scorePct,
    ).toBe(0);
  });
});

describe('scoreLesson — aggregation and edge cases', () => {
  it('averages scored items and rounds to the nearest integer', () => {
    // Two correct, one wrong -> 200/3 = 66.67 -> 67.
    const answers: Answer[] = [
      { stepId: 'q_mcq', type: 'mcq', optionId: 'a' }, // 100
      { stepId: 'q_tf', type: 'truefalse', value: true }, // 100
      { stepId: 'q_predict', type: 'predict', optionId: 'a' }, // 0
    ];
    const result = scoreLesson([mcq, trueFalse, predictScored], answers);
    expect(result.scorePct).toBe(67);
    expect(result.perItem).toHaveLength(3);
  });

  it('treats a missing answer to a scored item as 0', () => {
    const result = scoreLesson([mcq], []);
    expect(result.scorePct).toBe(0);
    expect(result.perItem).toEqual([
      { stepId: 'q_mcq', concept: 'c', correct: false, scorePct: 0 },
    ]);
  });

  it('ignores unscored steps (cards) entirely', () => {
    const result = scoreLesson([cards, mcq], [{ stepId: 'q_mcq', type: 'mcq', optionId: 'a' }]);
    expect(result.perItem.map((i) => i.stepId)).toEqual(['q_mcq']);
    expect(result.scorePct).toBe(100);
  });

  it('scores a lesson with no scored items as 100', () => {
    const result = scoreLesson([cards], []);
    expect(result.scorePct).toBe(100);
    expect(result.perItem).toEqual([]);
  });

  it('does not score an opt-in step left unscored by the author', () => {
    // predict defaults to scored:false, so with no `scored:true` it is skipped.
    const unscoredPredict = step({
      id: 'p0',
      type: 'predict',
      prompt: 'guess',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      reveal: 'done',
    });
    const result = scoreLesson([unscoredPredict], []);
    expect(result.perItem).toEqual([]);
    expect(result.scorePct).toBe(100);
  });

  it('preserves step order and concept tags in perItem', () => {
    const answers: Answer[] = [
      { stepId: 'q_tf', type: 'truefalse', value: true },
      { stepId: 'q_mcq', type: 'mcq', optionId: 'a' },
    ];
    // Answers given out of order; perItem must follow step order.
    const result = scoreLesson([mcq, trueFalse], answers);
    expect(result.perItem.map((i) => i.stepId)).toEqual(['q_mcq', 'q_tf']);
    expect(result.perItem.every((i) => i.concept === 'c')).toBe(true);
  });

  it('ignores an answer whose type does not match the step (scores 0)', () => {
    const mismatched: Answer = { stepId: 'q_mcq', type: 'truefalse', value: true };
    expect(scoreLesson([mcq], [mismatched]).scorePct).toBe(0);
  });
});

describe('isPassing (requirement 5.3)', () => {
  it('passes at or above the threshold and fails below it', () => {
    expect(isPassing(60, 60)).toBe(true);
    expect(isPassing(80, 60)).toBe(true);
    expect(isPassing(59, 60)).toBe(false);
    expect(isPassing(0, 1)).toBe(false);
  });
});

describe('scoreLesson — property-style invariants (requirement 5.1)', () => {
  const options = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ];

  it('score is always 0-100 and equals the mean of all-correct=100 / else 0', () => {
    const rng = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    for (let seed = 0; seed < 300; seed++) {
      const r = rng(seed);
      const count = 1 + Math.floor(r() * 6);
      const steps: Step[] = [];
      const answers: Answer[] = [];
      let correctCount = 0;

      for (let i = 0; i < count; i++) {
        const id = `m${i}`;
        const correctId = options[Math.floor(r() * options.length)].id;
        steps.push(
          step({
            id,
            type: 'mcq',
            prompt: 'q',
            options,
            correctId,
            explanation: 'e',
            concept: 'c',
          }),
        );
        // Answer correctly with ~50% probability.
        const answerCorrectly = r() < 0.5;
        const chosen = answerCorrectly ? correctId : options.find((o) => o.id !== correctId)!.id;
        if (answerCorrectly) correctCount++;
        answers.push({ stepId: id, type: 'mcq', optionId: chosen });
      }

      const result = scoreLesson(steps, answers);
      expect(result.scorePct).toBeGreaterThanOrEqual(0);
      expect(result.scorePct).toBeLessThanOrEqual(100);
      expect(result.scorePct).toBe(Math.round((correctCount * 100) / count));
      expect(result.perItem.filter((i) => i.correct)).toHaveLength(correctCount);
    }
  });
});

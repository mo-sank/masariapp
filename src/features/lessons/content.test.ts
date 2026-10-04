import { getLesson, listLessons } from './content';
import { scoreLesson, type Answer } from './scoring';

/**
 * L0 Placement Quest content guards (requirements 6.1, 6.2).
 *
 * These assert the authored L0 lesson has the shape the placement flow relies
 * on: it is the first node (no prerequisite), a `placement` kind with no XP and
 * no pass gate, has 10 scored items tagged by the three placement concepts, and
 * every scored item carries a concept tag so the per-item results sent to
 * `submit_assessment` are complete. (The no-reveal behaviour itself lives in the
 * player/results UI and is covered by those component tests.)
 */
describe('L0 Placement Quest content (6.1, 6.2)', () => {
  const l0 = getLesson('L0');

  it('is bundled and exposed by the loader', () => {
    expect(l0).toBeDefined();
    expect(listLessons().some((l) => l.id === 'L0')).toBe(true);
  });

  it('is the first node: a placement lesson with no prerequisite (6.1)', () => {
    expect(l0?.kind).toBe('placement');
    expect(l0?.prerequisite).toBeNull();
    // First by unit/order so the path and Continue target surface it first.
    expect(l0?.unit).toBe(0);
    expect(l0?.order).toBe(0);
  });

  it('has no XP and no pass gate (a placement has no pass/fail, 6.2/6.3)', () => {
    expect(l0?.xp).toBe(0);
    expect(l0?.passScore).toBe(0);
  });

  it('presents 10 fixed scored items tagged by the placement concepts (6.2)', () => {
    const steps = l0?.steps ?? [];
    // Build a dummy all-wrong answer set to drive the scorer, which reports the
    // scored items (the per-item breakdown has one entry per scored step).
    const answers: Answer[] = [];
    const { perItem } = scoreLesson(steps, answers);

    expect(perItem).toHaveLength(10);
    // Every scored item has a concept tag (6.2 / 1.3).
    expect(perItem.every((item) => typeof item.concept === 'string' && item.concept.length > 0)).toBe(
      true,
    );
    // The concepts span money basics, stock basics, and risk (6.2).
    const concepts = new Set(perItem.map((item) => item.concept));
    expect(concepts).toEqual(new Set(['money-basics', 'stock-basics', 'risk']));
  });
});

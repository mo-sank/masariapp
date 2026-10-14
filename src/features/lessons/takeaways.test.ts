import { getTakeaway, listTakeaways, LESSON_TAKEAWAYS } from './takeaways';

describe('lesson takeaways catalog', () => {
  it('provides comprehensive takeaways for core lessons and boss', () => {
    const list = listTakeaways();
    expect(list.length).toBeGreaterThanOrEqual(7);
    expect(list.some((t) => t.lessonId === 'L1.1')).toBe(true);
    expect(list.some((t) => t.lessonId === 'B1')).toBe(true);
  });

  it('contains actionable bullets and teen analogies for every entry', () => {
    for (const [id, t] of Object.entries(LESSON_TAKEAWAYS)) {
      expect(t.lessonId).toBe(id);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.bullets.length).toBeGreaterThanOrEqual(2);
      expect(t.teenAnalogy.length).toBeGreaterThan(15);
      expect(t.emoji.length).toBeGreaterThan(0);
    }
  });

  it('fetches specific takeaway by lessonId', () => {
    const pizza = getTakeaway('L1.1');
    expect(pizza).toBeDefined();
    expect(pizza?.title).toBe('Slice the Pizza');
    expect(getTakeaway('UNKNOWN')).toBeUndefined();
  });
});

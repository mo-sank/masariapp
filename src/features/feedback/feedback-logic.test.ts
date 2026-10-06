import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
  isFeedbackSubmittable,
} from './feedback-logic';

describe('feedback-logic', () => {
  it('offers exactly the four categories the RPC validates', () => {
    expect(FEEDBACK_CATEGORIES.map((c) => c.id)).toEqual(['bug', 'idea', 'confusing', 'other']);
  });

  it('caps the message at the feedback.message column limit (1000)', () => {
    expect(FEEDBACK_MESSAGE_MAX).toBe(1000);
  });

  describe('isFeedbackSubmittable', () => {
    it('is false when no category is chosen', () => {
      expect(isFeedbackSubmittable(null, 'the chart is blank')).toBe(false);
    });

    it('is false when the message is empty', () => {
      expect(isFeedbackSubmittable('bug', '')).toBe(false);
    });

    it('is false when the message is only whitespace', () => {
      expect(isFeedbackSubmittable('bug', '   \n\t ')).toBe(false);
    });

    it('is true with a category and a non-empty message', () => {
      expect(isFeedbackSubmittable('idea', 'add dark mode')).toBe(true);
    });

    it('is true with a message exactly at the limit', () => {
      expect(isFeedbackSubmittable('other', 'x'.repeat(FEEDBACK_MESSAGE_MAX))).toBe(true);
    });

    it('is false when the message exceeds the limit', () => {
      expect(isFeedbackSubmittable('other', 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1))).toBe(false);
    });
  });
});

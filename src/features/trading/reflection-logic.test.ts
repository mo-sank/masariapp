import {
  REFLECTION_CHOICES,
  REFLECTION_FEATURE_KEY,
  REFLECTION_NOTE_MAX,
  isReflectionComplete,
  reflectionExpectationLabel,
} from './reflection-logic';

describe('reflection-logic', () => {
  it('gates on the post_trade_reflection catalog key (seed: L1.5)', () => {
    expect(REFLECTION_FEATURE_KEY).toBe('post_trade_reflection');
  });

  it('offers exactly the three expectations the RPC validates', () => {
    expect(REFLECTION_CHOICES.map((c) => c.id)).toEqual(['better', 'as_expected', 'worse']);
  });

  describe('reflectionExpectationLabel', () => {
    it('maps a stored expectation to its friendly label', () => {
      expect(reflectionExpectationLabel('as_expected')).toBe('As expected');
      expect(reflectionExpectationLabel('better')).toBe('Better');
      expect(reflectionExpectationLabel('worse')).toBe('Worse');
    });

    it('falls back to the raw value for an unknown expectation', () => {
      expect(reflectionExpectationLabel('mystery')).toBe('mystery');
    });
  });

  describe('isReflectionComplete', () => {
    it('is false when no expectation is chosen', () => {
      expect(isReflectionComplete(null, '')).toBe(false);
    });

    it('is true with an expectation and no note', () => {
      expect(isReflectionComplete('better', '')).toBe(true);
    });

    it('is true with a note at the limit', () => {
      expect(isReflectionComplete('worse', 'x'.repeat(REFLECTION_NOTE_MAX))).toBe(true);
    });

    it('is false when the note exceeds the limit', () => {
      expect(isReflectionComplete('worse', 'x'.repeat(REFLECTION_NOTE_MAX + 1))).toBe(false);
    });
  });
});

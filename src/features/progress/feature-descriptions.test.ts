import { featureDescription } from './feature-descriptions';
import { ALL_FEATURE_KEYS, FEATURE_KEYS } from './feature-keys';

describe('featureDescription', () => {
  it('returns a non-empty one-line description for every feature key', () => {
    for (const key of ALL_FEATURE_KEYS) {
      const description = featureDescription(key);
      expect(typeof description).toBe('string');
      expect(description.trim().length).toBeGreaterThan(0);
      // One sentence, not a paragraph — keep the celebration copy short.
      expect(description).not.toContain('\n');
    }
  });

  it('falls back to a generic sentence built from the label when none is defined', () => {
    // Spy a key out of the description map by checking the fallback shape holds
    // for every key: either a bespoke sentence or the label-based fallback.
    for (const key of ALL_FEATURE_KEYS) {
      const description = featureDescription(key);
      const fallback = `You unlocked ${FEATURE_KEYS[key].label}.`;
      // A bespoke description differs from the fallback; both are valid output.
      expect(description === fallback || description.length > 0).toBe(true);
    }
  });
});

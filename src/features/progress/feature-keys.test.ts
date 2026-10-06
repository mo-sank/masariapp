import {
  ALL_FEATURE_KEYS,
  FEATURE_KEYS,
  featureKeysFromContent,
  isFeatureKey,
  type FeatureKey,
} from './feature-keys';
import { getLesson } from '../lessons/content';

/**
 * Feature-key drift guard (requirements 1.3, 1.5).
 *
 * Feature keys are defined once in `feature-keys.ts`, but the keys that
 * actually matter are the ones the lesson content declares in its `unlocks`
 * arrays — those are what `complete_lesson` grants and what the server checks.
 * If the two sets ever diverge (an author adds an unlock, or renames a key),
 * a screen could gate on a key that is never granted, or a granted feature
 * would have no definition. These tests fail loudly in that case so the drift
 * is caught in CI, not by a learner stuck behind a feature that never unlocks.
 */
describe('feature-key drift (1.3, 1.5)', () => {
  it('FEATURE_KEYS is exactly the set of keys declared in lesson content', () => {
    const defined = new Set<string>(ALL_FEATURE_KEYS);
    const fromContent = featureKeysFromContent();

    // Keys the content unlocks but we never defined (would be ungated).
    const missing = [...fromContent].filter((k) => !defined.has(k));
    // Keys we defined but no lesson unlocks (dead definitions).
    const extra = [...defined].filter((k) => !fromContent.has(k));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('every feature key names a lesson that exists in the catalog', () => {
    for (const key of ALL_FEATURE_KEYS) {
      const { lessonId } = FEATURE_KEYS[key];
      expect(getLesson(lessonId)).toBeDefined();
    }
  });

  it('each feature key is unlocked by the lesson its metadata points to', () => {
    for (const key of ALL_FEATURE_KEYS) {
      const { lessonId } = FEATURE_KEYS[key];
      const lesson = getLesson(lessonId);
      expect(lesson?.unlocks).toContain(key);
    }
  });

  it('every feature key has a non-empty label', () => {
    for (const key of ALL_FEATURE_KEYS) {
      expect(FEATURE_KEYS[key].label.trim().length).toBeGreaterThan(0);
    }
  });

  describe('isFeatureKey', () => {
    it('accepts a known key and narrows the type', () => {
      const candidate = 'portfolio';
      expect(isFeatureKey(candidate)).toBe(true);
      if (isFeatureKey(candidate)) {
        // Compile-time check: candidate is now FeatureKey.
        const key: FeatureKey = candidate;
        expect(FEATURE_KEYS[key]).toBeDefined();
      }
    });

    it('rejects an unknown key', () => {
      expect(isFeatureKey('not_a_real_feature')).toBe(false);
    });
  });
});

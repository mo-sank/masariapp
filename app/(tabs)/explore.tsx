import { LockedState, Screen } from '../../src/components/ui';

/**
 * Explore tab (requirements 7.1, 7.2).
 *
 * Market browse is unlocked by the "Slice the Pizza" lesson (per the lesson
 * plan). Until then the tab shows a locked state that names the unlocking lesson
 * so the user knows how to open it, instead of a dead end. The real unlock
 * wiring and browse UI arrive in later specs.
 */
export default function ExploreScreen() {
  return (
    <Screen>
      <LockedState featureName="Explore" unlockedByLesson="Slice the Pizza" />
    </Screen>
  );
}

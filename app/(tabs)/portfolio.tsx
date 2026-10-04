import { LockedState, Screen } from '../../src/components/ui';

/**
 * Portfolio tab (requirements 7.1, 7.2).
 *
 * The paper-trading portfolio is unlocked by the "Your First Trade" lesson (per
 * the lesson plan). Until then the tab shows a locked state naming that lesson,
 * never a blank screen. Positions, holdings, and performance arrive in later
 * specs.
 */
export default function PortfolioScreen() {
  return (
    <Screen>
      <LockedState featureName="Portfolio" unlockedByLesson="Your First Trade" />
    </Screen>
  );
}

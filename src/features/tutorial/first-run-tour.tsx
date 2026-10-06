/**
 * First-run tour launcher (onboarding-revamp).
 *
 * Decides whether to show the coachmark tour on this launch and renders the
 * overlay when so. Kept separate from the tabs layout so the launch logic (show
 * once per device, fire the analytics lifecycle events, persist the seen flag)
 * is testable without the Expo Router navigator.
 *
 * Behavior:
 *   - On first entry when the device has NOT seen the tour, it becomes visible
 *     exactly once and logs `tutorial_started`.
 *   - On finish it hides, logs `tutorial_completed` or `tutorial_skipped` to
 *     match the outcome, and persists the seen flag so the tour never auto-shows
 *     again.
 *
 * The steps default to the four-tab tour but are injectable for testing.
 */
import { useEffect, useRef, useState } from 'react';

import { CoachmarkOverlay } from './coachmark-overlay';
import type { TutorialStep } from './steps';
import { TAB_TOUR_STEPS } from './tour';
import { useTutorialSeen } from './use-tutorial-seen';
import { track } from '../../lib/analytics';

export interface FirstRunTourProps {
  /** The steps to walk through; defaults to the four-tab tour. */
  steps?: TutorialStep[];
}

export function FirstRunTour({ steps = TAB_TOUR_STEPS }: FirstRunTourProps) {
  const { isLoading, hasSeen, markSeen } = useTutorialSeen();
  const [visible, setVisible] = useState(false);
  // Guard so the tour launches (and logs tutorial_started) exactly once.
  const launchedRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasSeen || launchedRef.current) {
      return;
    }
    launchedRef.current = true;
    setVisible(true);
    track('tutorial_started');
  }, [isLoading, hasSeen]);

  const onFinish = (outcome: 'completed' | 'skipped') => {
    setVisible(false);
    track(outcome === 'completed' ? 'tutorial_completed' : 'tutorial_skipped');
    void markSeen();
  };

  return <CoachmarkOverlay visible={visible} steps={steps} onFinish={onFinish} />;
}

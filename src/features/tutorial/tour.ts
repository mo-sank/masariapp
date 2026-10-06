/**
 * The first-run tab tour (onboarding-revamp).
 *
 * The ordered steps the coachmark overlay walks a brand-new user through on
 * their first entry into the app, one per bottom tab. The `targetId` of each
 * step matches the id each tab button registers with the tutorial target
 * registry (see app/(tabs)/_layout.tsx), so the overlay can spotlight the right
 * tab. Copy is short and friendly, matching the app's tone.
 */
import type { TutorialStep } from './steps';

/** Stable target ids for the four bottom tabs. */
export const TAB_TARGET_IDS = {
  learn: 'tab-learn',
  explore: 'tab-explore',
  portfolio: 'tab-portfolio',
  profile: 'tab-profile',
} as const;

/** The ordered tab tour: Learn -> Explore -> Portfolio -> Profile. */
export const TAB_TOUR_STEPS: TutorialStep[] = [
  {
    targetId: TAB_TARGET_IDS.learn,
    title: 'Learn',
    body: 'Start here. Work through short, guided lessons to build your investing skills.',
  },
  {
    targetId: TAB_TARGET_IDS.explore,
    title: 'Explore',
    body: 'Browse stocks and discover companies to practice trading with.',
  },
  {
    targetId: TAB_TARGET_IDS.portfolio,
    title: 'Portfolio',
    body: 'Track your simulated holdings and see how your practice trades are doing.',
  },
  {
    targetId: TAB_TARGET_IDS.profile,
    title: 'Profile',
    body: 'Check your progress, stats, and settings any time from here.',
  },
];

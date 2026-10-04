/**
 * Lesson feedback haptics (requirement 3.4).
 *
 * When a learner answers a scored step the player fires a short, light haptic
 * tap alongside the on-screen correct/incorrect feedback. Requirement 3.4 asks
 * for *light* haptics for both correct and incorrect results and for the app to
 * respect the OS reduce-motion setting, so this module exposes a single
 * `feedbackHaptic(correct, reduceMotion)` that:
 *   - does nothing when `reduceMotion` is on (the user asked for minimal motion,
 *     and a vibration is a form of motion we skip to honour that preference), and
 *   - otherwise fires a Light impact for either outcome.
 *
 * We deliberately use the SAME light impact for correct and incorrect rather
 * than the heavier `notificationAsync` success/error patterns: the requirement
 * calls for light feedback in both cases, and a gentle, uniform tap keeps the
 * experience calm rather than punishing a wrong answer with a stronger buzz.
 *
 * `expo-haptics` is imported lazily inside the call so unit tests of the player
 * (and the pure session/scoring modules) never pull the native module into the
 * bundle, and so a platform without a haptics engine simply resolves to a no-op.
 * The call is fire-and-forget and never throws: a failed or unavailable haptic
 * must never interrupt the lesson flow.
 */

/**
 * Fire the light feedback haptic for a scored answer, unless reduce-motion is
 * enabled. Safe to call anywhere; swallows every error.
 *
 * @param correct - Whether the answer was correct. Both outcomes use the same
 *   light impact (requirement 3.4); the flag is accepted so the call site reads
 *   clearly and so the behaviour can evolve without touching callers.
 * @param reduceMotion - The OS reduce-motion setting (from `useReduceMotion`).
 *   When true, no haptic is fired.
 */
export function feedbackHaptic(correct: boolean, reduceMotion: boolean): void {
  // Respect reduce-motion: skip the vibration entirely (requirement 3.4).
  if (reduceMotion) {
    return;
  }
  // `correct` is intentionally unused in the effect today — both outcomes use a
  // light tap — but is part of the contract so the behaviour can diverge later.
  void correct;

  void (async () => {
    try {
      const Haptics = await import('expo-haptics');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // No haptics engine, or the module is unavailable (web/tests): no-op.
    }
  })();
}

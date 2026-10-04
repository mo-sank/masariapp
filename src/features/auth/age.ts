/**
 * Age-gate math (requirements 2.1-2.4).
 *
 * The app never collects or stores an exact birth date. It asks only for a
 * birth month and year, then derives a coarse age to decide whether to show the
 * minimum-age block. To stay on the safe side of the under-13 rule, we treat the
 * user's birthday as the LAST day of their birth month (requirement 2.4): a user
 * born any day within that month is therefore never considered older than they
 * truly are. This makes `computeAge` a conservative lower bound on the real age,
 * so a borderline user is treated as younger and gated rather than let through.
 *
 * Everything here is pure and side-effect free so it can be unit tested without
 * a device, a clock, or any storage.
 */

/** Minimum age, in years, required to proceed past the age gate. */
export const MIN_AGE = 13;

/**
 * The last calendar day of a given month, accounting for leap years.
 *
 * `month` is 1-based (1 = January ... 12 = December). Using day 0 of the next
 * month is the standard JS trick to get the last day of the current month, and
 * it handles February in leap years correctly.
 */
export function lastDayOfMonth(month: number, year: number): number {
  // `new Date(year, month, 0)` rolls back to the final day of `month` because
  // `month` here is 0-based for the Date constructor, so passing the 1-based
  // month lands on the following month, and day 0 steps back one day.
  return new Date(year, month, 0).getDate();
}

/**
 * Compute a conservative age in whole years from a birth month and year.
 *
 * @param birthMonth 1-based birth month (1-12).
 * @param birthYear  Four-digit birth year.
 * @param now        The reference date (defaults to the current date). Injected
 *                   so tests can pin a deterministic "today".
 * @returns The user's age in completed years, computed as if they were born on
 *          the last day of their birth month. Never negative: an impossible
 *          future birth date clamps to 0.
 *
 * The result is a lower bound on the true age: because we anchor to the last day
 * of the birth month, a user who has not yet reached that day-of-month in the
 * current period is counted as not having had their birthday, so they are never
 * treated as older than they really are.
 */
export function computeAge(birthMonth: number, birthYear: number, now: Date = new Date()): number {
  const effectiveBirthDay = lastDayOfMonth(birthMonth, birthYear);

  const nowYear = now.getFullYear();
  // getMonth() is 0-based; shift to 1-based to compare with birthMonth.
  const nowMonth = now.getMonth() + 1;
  const nowDay = now.getDate();

  let age = nowYear - birthYear;

  // Subtract a year if the effective birthday (last day of the birth month) has
  // not happened yet this year.
  const birthdayHasPassed =
    nowMonth > birthMonth || (nowMonth === birthMonth && nowDay >= effectiveBirthDay);
  if (!birthdayHasPassed) {
    age -= 1;
  }

  return Math.max(0, age);
}

/**
 * Whether a computed age is below the minimum required to use the app.
 *
 * Pairs with `computeAge`: because that value is a conservative lower bound,
 * any user who could be under {@link MIN_AGE} is classified as under the
 * minimum and blocked.
 */
export function isUnderMin(age: number): boolean {
  return age < MIN_AGE;
}

/** The outcome of the age gate for a given birth month/year. */
export type AgeGateDecision =
  { kind: 'block' } | { kind: 'allow'; birthMonth: number; birthYear: number };

/**
 * Decide what the age gate should do for a birth month/year (requirements
 * 2.2, 2.3). Pure so the screen stays a thin shell: it computes the
 * conservative age and returns either a block decision (under the minimum, no
 * birth date retained) or an allow decision carrying the month/year to keep in
 * memory for onboarding.
 */
export function decideAgeGate(
  birthMonth: number,
  birthYear: number,
  now: Date = new Date(),
): AgeGateDecision {
  const age = computeAge(birthMonth, birthYear, now);
  if (isUnderMin(age)) {
    return { kind: 'block' };
  }
  return { kind: 'allow', birthMonth, birthYear };
}

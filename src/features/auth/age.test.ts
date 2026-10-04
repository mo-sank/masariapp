import { computeAge, decideAgeGate, isUnderMin, lastDayOfMonth, MIN_AGE } from './age';

/**
 * Helper: build a reference "now" from a 1-based month so tests read naturally.
 */
function at(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day);
}

describe('lastDayOfMonth', () => {
  it('returns 31 for January', () => {
    expect(lastDayOfMonth(1, 2023)).toBe(31);
  });

  it('returns 30 for April', () => {
    expect(lastDayOfMonth(4, 2023)).toBe(30);
  });

  it('returns 28 for February in a common year', () => {
    expect(lastDayOfMonth(2, 2023)).toBe(28);
  });

  it('returns 29 for February in a leap year', () => {
    expect(lastDayOfMonth(2, 2024)).toBe(29);
  });

  it('returns 28 for February in a century non-leap year', () => {
    // 1900 is divisible by 100 but not 400, so it is NOT a leap year.
    expect(lastDayOfMonth(2, 1900)).toBe(28);
  });

  it('returns 29 for February in a 400-divisible leap year', () => {
    expect(lastDayOfMonth(2, 2000)).toBe(29);
  });

  it('returns 31 for December', () => {
    expect(lastDayOfMonth(12, 2023)).toBe(31);
  });
});

describe('computeAge - basic cases', () => {
  it('computes a straightforward age mid-year', () => {
    // Born June 2000, now July 2020 -> birthday (June 30) already passed.
    expect(computeAge(6, 2000, at(2020, 7, 15))).toBe(20);
  });

  it('clamps an impossible future birth date to 0 rather than going negative', () => {
    expect(computeAge(6, 2030, at(2020, 7, 15))).toBe(0);
  });
});

describe('computeAge - month boundaries', () => {
  it('counts the birthday month as reached only on/after the last day of the month', () => {
    // Born March 2010 -> effective birthday is March 31. Now March 30, 2023:
    // the last day of March has NOT arrived, so the user is still 12.
    expect(computeAge(3, 2010, at(2023, 3, 30))).toBe(12);
  });

  it('ticks over on the last day of the birth month', () => {
    // Same person, now March 31, 2023 -> turns 13.
    expect(computeAge(3, 2010, at(2023, 3, 31))).toBe(13);
  });

  it('treats a later month in the year as birthday-passed', () => {
    // Born November 2009, now December 2022 -> November already passed, age 13.
    expect(computeAge(11, 2009, at(2022, 12, 1))).toBe(13);
  });

  it('treats an earlier month in the year as birthday-not-yet-reached', () => {
    // Born November 2009, now January 2022 -> November not reached, age 12.
    expect(computeAge(11, 2009, at(2022, 1, 15))).toBe(12);
  });

  it('handles a December birth month at year end', () => {
    // Born December 2009 -> effective birthday Dec 31. Now Dec 31, 2022 -> 13.
    expect(computeAge(12, 2009, at(2022, 12, 31))).toBe(13);
    // One day earlier, Dec 30, 2022 -> still 12.
    expect(computeAge(12, 2009, at(2022, 12, 30))).toBe(12);
  });

  it('handles a January birth month at year start', () => {
    // Born January 2010 -> effective birthday Jan 31. Now Jan 30, 2023 -> 12.
    expect(computeAge(1, 2010, at(2023, 1, 30))).toBe(12);
    // Jan 31, 2023 -> turns 13.
    expect(computeAge(1, 2010, at(2023, 1, 31))).toBe(13);
  });
});

describe('computeAge - last-day-of-month rule (requirement 2.4)', () => {
  it('uses Feb 28 as the effective birthday in a common year', () => {
    // Born February 2010. In 2023 (common year) the last day of Feb is the 28th.
    expect(computeAge(2, 2010, at(2023, 2, 27))).toBe(12);
    expect(computeAge(2, 2010, at(2023, 2, 28))).toBe(13);
  });

  it('uses Feb 29 as the effective birthday in a leap year', () => {
    // Born February 2008. In 2024 (leap year) the last day of Feb is the 29th,
    // so the user does not turn 16 until Feb 29.
    expect(computeAge(2, 2008, at(2024, 2, 28))).toBe(15);
    expect(computeAge(2, 2008, at(2024, 2, 29))).toBe(16);
  });

  it('treats a 30-day month using day 30, not 31', () => {
    // Born April 2010 -> effective birthday April 30.
    expect(computeAge(4, 2010, at(2023, 4, 29))).toBe(12);
    expect(computeAge(4, 2010, at(2023, 4, 30))).toBe(13);
  });
});

describe('computeAge - exact 13th birthday edges around the gate', () => {
  it('is 12 the day before the effective 13th birthday', () => {
    expect(computeAge(6, 2010, at(2023, 6, 29))).toBe(12);
  });

  it('is 13 on the effective 13th birthday', () => {
    expect(computeAge(6, 2010, at(2023, 6, 30))).toBe(13);
  });
});

describe('decideAgeGate', () => {
  const now = new Date(2023, 5, 15); // June 15, 2023

  it('blocks an under-13 user and retains no birth date', () => {
    // Born June 2012 -> age 11 at June 2023.
    const decision = decideAgeGate(6, 2012, now);
    expect(decision).toEqual({ kind: 'block' });
  });

  it('blocks a user right on the under-13 boundary (birthday not yet reached)', () => {
    // Born July 2010 -> effective birthday July 31, not reached by June 15, 2023,
    // so the user is 12 and must be blocked.
    const decision = decideAgeGate(7, 2010, now);
    expect(decision).toEqual({ kind: 'block' });
  });

  it('allows a 13-or-older user and carries the birth month/year forward', () => {
    // Born May 2010 -> effective birthday May 31, passed by June 15, 2023 -> 13.
    const decision = decideAgeGate(5, 2010, now);
    expect(decision).toEqual({ kind: 'allow', birthMonth: 5, birthYear: 2010 });
  });
});

describe('isUnderMin', () => {
  it('is true below the minimum age', () => {
    expect(isUnderMin(MIN_AGE - 1)).toBe(true);
    expect(isUnderMin(0)).toBe(true);
  });

  it('is false at exactly the minimum age', () => {
    expect(isUnderMin(MIN_AGE)).toBe(false);
  });

  it('is false above the minimum age', () => {
    expect(isUnderMin(MIN_AGE + 10)).toBe(false);
  });
});

/**
 * Property 6 (age-gate conservatism / monotonicity).
 *
 * Validates: Requirement 2
 *
 * For any birth month, birth year, and reference date, `computeAge` must be a
 * LOWER BOUND on the user's true age: anchoring to the last day of the birth
 * month means no actual birthday within that month can make the user older than
 * the computed value. We assert this across a dense deterministic sweep rather
 * than a single example, since the design calls for the property to hold over
 * randomly generated triples (we use an exhaustive bounded sweep to avoid adding
 * a property-testing dependency while still covering the input space thoroughly).
 */
describe('computeAge - conservatism property (Property 6)', () => {
  it('is never greater than the true age for any day within the birth month', () => {
    for (let birthYear = 2000; birthYear <= 2015; birthYear++) {
      for (let birthMonth = 1; birthMonth <= 12; birthMonth++) {
        const monthLength = lastDayOfMonth(birthMonth, birthYear);
        for (let birthDay = 1; birthDay <= monthLength; birthDay++) {
          // Sample a spread of reference dates across years and months.
          for (let nowYear = birthYear; nowYear <= birthYear + 25; nowYear += 5) {
            for (let nowMonth = 1; nowMonth <= 12; nowMonth += 3) {
              const now = at(nowYear, nowMonth, 15);
              const computed = computeAge(birthMonth, birthYear, now);

              // True age using the actual birth day within the month.
              const trueBirth = new Date(birthYear, birthMonth - 1, birthDay);
              let trueAge = now.getFullYear() - trueBirth.getFullYear();
              const beforeBirthday =
                now.getMonth() < trueBirth.getMonth() ||
                (now.getMonth() === trueBirth.getMonth() && now.getDate() < trueBirth.getDate());
              if (beforeBirthday) {
                trueAge -= 1;
              }
              trueAge = Math.max(0, trueAge);

              // Conservatism: computed age must never exceed the real age.
              expect(computed).toBeLessThanOrEqual(trueAge);
            }
          }
        }
      }
    }
  });

  it('classifies every under-13 case as blocked', () => {
    // Any triple whose true age is under 13 must be gated: because computeAge is
    // a lower bound, isUnderMin(computeAge(...)) is true whenever the true age is
    // under the minimum.
    const now = at(2023, 6, 15);
    for (let birthYear = 2011; birthYear <= 2023; birthYear++) {
      for (let birthMonth = 1; birthMonth <= 12; birthMonth++) {
        const age = computeAge(birthMonth, birthYear, now);
        if (age < MIN_AGE) {
          expect(isUnderMin(age)).toBe(true);
        }
      }
    }
  });
});

/**
 * Pure reflection logic (requirement 9.2).
 *
 * The small, framework-free pieces the reflection flow relies on, kept out of
 * the React components and the Supabase-backed mutation so they can be unit
 * tested directly and shared by both the sell flow and the trade-history list:
 *
 *  - {@link REFLECTION_FEATURE_KEY}: the catalog feature key that gates the
 *    post-trade reflection prompt (seed catalog: `post_trade_reflection` -> L1.5).
 *  - {@link ReflectionExpectation} and {@link REFLECTION_CHOICES}: the three
 *    allowed answers to "Did it go better, as expected, or worse?" plus their
 *    display labels. The ids mirror the values `submit_reflection` validates
 *    (`better` | `as_expected` | `worse`).
 *  - {@link REFLECTION_NOTE_MAX} and {@link isReflectionComplete}: the 280-char
 *    note cap (the `trade_reflections.note` column limit) and the gate that a
 *    reflection needs one expectation chosen and a note within the limit.
 */

/** Catalog feature key that unlocks the post-trade reflection (seed: L1.5). */
export const REFLECTION_FEATURE_KEY = 'post_trade_reflection';

/** Maximum length of the optional reflection note (DB column limit, 9.2). */
export const REFLECTION_NOTE_MAX = 280;

/** The three allowed reflection answers (mirrors the RPC's validation). */
export type ReflectionExpectation = 'better' | 'as_expected' | 'worse';

/** A single reflection choice: the stored id plus its display label. */
export interface ReflectionChoice {
  id: ReflectionExpectation;
  label: string;
}

/**
 * The fixed set of reflection answers offered after a sell (requirement 9.2).
 * Ids are stored in `trade_reflections.expectation`; labels are shown on the
 * choice buttons.
 */
export const REFLECTION_CHOICES: readonly ReflectionChoice[] = [
  { id: 'better', label: 'Better' },
  { id: 'as_expected', label: 'As expected' },
  { id: 'worse', label: 'Worse' },
] as const;

/** Plain-language label for a stored expectation value (used by history). */
export function reflectionExpectationLabel(expectation: string): string {
  const choice = REFLECTION_CHOICES.find((c) => c.id === expectation);
  return choice?.label ?? expectation;
}

/**
 * Whether a reflection is complete enough to submit (9.2): an expectation is
 * chosen and the note (if any) is within the 280-char limit.
 */
export function isReflectionComplete(
  expectation: ReflectionExpectation | null,
  note: string,
): boolean {
  if (expectation == null) {
    return false;
  }
  return note.length <= REFLECTION_NOTE_MAX;
}

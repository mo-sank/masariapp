/**
 * Pure feedback logic (requirement 5.1).
 *
 * The small, framework-free pieces the Send-feedback flow relies on, kept out of
 * the React screen and the Supabase-backed mutation so they can be unit tested
 * directly:
 *
 *  - {@link FeedbackCategory} and {@link FEEDBACK_CATEGORIES}: the four allowed
 *    categories and their display labels. The ids mirror the values the
 *    `feedback.category` CHECK and the `submit_feedback` RPC validate
 *    (`bug` | `idea` | `confusing` | `other`).
 *  - {@link FEEDBACK_MESSAGE_MAX} and {@link isFeedbackSubmittable}: the
 *    1000-char message cap (the `feedback.message` column limit) and the gate
 *    that a submission needs a category chosen and a non-empty message within
 *    the limit. "Non-empty" ignores surrounding whitespace, matching the RPC,
 *    which trims the message and rejects a whitespace-only one.
 */

/** The four allowed feedback categories (mirrors the RPC/table validation). */
export type FeedbackCategory = 'bug' | 'idea' | 'confusing' | 'other';

/** Maximum length of a feedback message (DB column limit, requirement 5.1). */
export const FEEDBACK_MESSAGE_MAX = 1000;

/** A single feedback category: the stored id plus its display label. */
export interface FeedbackCategoryChoice {
  id: FeedbackCategory;
  label: string;
}

/**
 * The fixed set of categories offered on the Send-feedback screen
 * (requirement 5.1). Ids are stored in `feedback.category`; labels are shown on
 * the choice chips.
 */
export const FEEDBACK_CATEGORIES: readonly FeedbackCategoryChoice[] = [
  { id: 'bug', label: 'Something broke' },
  { id: 'idea', label: 'I have an idea' },
  { id: 'confusing', label: 'This was confusing' },
  { id: 'other', label: 'Something else' },
] as const;

/**
 * Whether a feedback entry can be submitted (requirement 5.1): a category is
 * chosen and the message has at least one non-whitespace character and is within
 * the 1000-char limit. The character count is of the raw entered text (what the
 * limit UI shows); the non-empty check ignores surrounding whitespace to match
 * the server, which trims before validating.
 */
export function isFeedbackSubmittable(
  category: FeedbackCategory | null,
  message: string,
): boolean {
  if (category == null) {
    return false;
  }
  if (message.trim().length < 1) {
    return false;
  }
  return message.length <= FEEDBACK_MESSAGE_MAX;
}

/**
 * The reviewed "why prices move" tip templates (requirements 4.2, 4.4).
 *
 * Card 3 of the Daily Market Briefing shows a short "why prices move" tip from a
 * rotating template list (requirement 4.2). The design is explicit that the tips
 * are "a reviewed template list" that "live in the client" and that the briefing
 * carries "no AI-generated text, no recommendations" (requirement 4.4): the
 * server only sends a `tip_index`, and the actual sentences are these fixed,
 * human-reviewed strings. Nothing here recommends an action — each tip explains
 * a general reason prices move, in plain language for a teen beta audience.
 *
 * Rotation: the server computes `tip_index = day-of-year (ET) mod tip count`, so
 * the tip changes once per day and is stable within a day. For the server's
 * modulus to line up with this list, `app_config.briefing_tip_count` is kept
 * equal to `BRIEFING_TIPS.length` (migration 20250106000001 seeds it to 6).
 * `tipForIndex` additionally clamps the index into range, so a config/list drift
 * can never crash the card — it just shows a valid tip.
 *
 * Pure data — no React, Expo, or network imports — so it is usable from the
 * component and from tests alike.
 */

/** A single reviewed tip: a short title and one plain-language sentence. */
export interface BriefingTip {
  /** Short heading shown above the explanation. */
  title: string;
  /** One sentence explaining a general reason prices move. Never advice. */
  body: string;
}

/**
 * The reviewed tip templates. Order is stable: the server's `tip_index` maps to
 * a position here, so inserting or reordering tips changes which tip shows on a
 * given day — intended, but keep the count in sync with
 * `app_config.briefing_tip_count`.
 */
export const BRIEFING_TIPS: readonly BriefingTip[] = [
  {
    title: 'Supply and demand',
    body: 'A price moves when more people want to buy a stock than sell it, or the other way around.',
  },
  {
    title: 'Company news',
    body: 'Earnings reports and big announcements change what people think a company is worth.',
  },
  {
    title: 'The whole market',
    body: 'On some days most stocks move together because news affects the whole market at once.',
  },
  {
    title: 'Expectations',
    body: 'Prices often move on what people expect to happen next, not just on what already happened.',
  },
  {
    title: 'Interest rates',
    body: 'When borrowing money gets more or less expensive, it can shift prices across many stocks.',
  },
  {
    title: 'Everyday swings',
    body: 'Small ups and downs are normal — a single day rarely tells you much on its own.',
  },
] as const;

/** How many reviewed tips exist. Kept equal to `app_config.briefing_tip_count`. */
export const BRIEFING_TIP_COUNT = BRIEFING_TIPS.length;

/**
 * The tip for a server-provided `tip_index`, clamped safely into range. A
 * negative, out-of-range, or non-integer index can never crash card 3: it wraps
 * with a modulo and falls back to the first tip for anything unusable.
 */
export function tipForIndex(index: number): BriefingTip {
  if (!Number.isFinite(index)) {
    return BRIEFING_TIPS[0];
  }
  const normalized = ((Math.trunc(index) % BRIEFING_TIP_COUNT) + BRIEFING_TIP_COUNT) % BRIEFING_TIP_COUNT;
  return BRIEFING_TIPS[normalized];
}

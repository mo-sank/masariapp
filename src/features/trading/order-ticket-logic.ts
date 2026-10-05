/**
 * Pure order-ticket logic (requirements 8.4, 9.1).
 *
 * The small, framework-free rules the order ticket relies on, kept out of the
 * React components so they can be unit tested directly:
 *
 *  - {@link estimateTotalCents}: the live cost estimate — quantity times the
 *    current quote price, in integer cents (money stays in cents everywhere,
 *    per src/lib/money.ts). The server is authoritative on the real fill price;
 *    this is a labelled estimate only (design: "estimate; fills at the latest
 *    price").
 *  - {@link RATIONALE_CHIPS} and {@link isRationaleComplete}: the fixed set of
 *    reason chips and the gate that a rationale-required buy needs at least one
 *    chip selected and a note within the 280-char limit (requirement 9.1).
 */

/** Maximum length of the optional rationale note (DB column limit, 9.1). */
export const RATIONALE_NOTE_MAX = 280;

/**
 * Catalog feature keys gating each order side and the rationale requirement
 * (supabase/seed/catalog.generated.sql). `market_buy` / `market_sell` gate the
 * Buy/Sell toggle; `pre_trade_rationale` makes a reason chip required on a buy
 * (requirement 9.1). These live here, in the framework-free module, so both the
 * ticket and the Trade button can read them without pulling in the
 * Supabase-backed mutation hook.
 */
export const BUY_FEATURE_KEY = 'market_buy';
export const SELL_FEATURE_KEY = 'market_sell';
export const RATIONALE_FEATURE_KEY = 'pre_trade_rationale';

/** A single rationale chip: a stable id plus its display label. */
export interface RationaleChip {
  id: string;
  label: string;
}

/**
 * The fixed rationale reasons offered on a buy (design "Order ticket flow").
 * Ids are stored in `orders.rationale_tags`; labels are shown on the chips.
 */
export const RATIONALE_CHIPS: readonly RationaleChip[] = [
  { id: 'know_the_brand', label: 'I know the brand' },
  { id: 'growing_company', label: 'Growing company' },
  { id: 'learning_from_lesson', label: 'Learning from a lesson' },
  { id: 'just_exploring', label: 'Just exploring' },
] as const;

/**
 * Estimated cost of an order in integer cents: `qty * priceCents`. Returns 0
 * when the price is unknown (no quote yet) or the quantity is below 1, so the
 * ticket can show "$0.00" rather than a NaN while data loads.
 */
export function estimateTotalCents(qty: number, priceCents: number | null | undefined): number {
  if (priceCents == null || !Number.isFinite(priceCents)) {
    return 0;
  }
  if (!Number.isFinite(qty) || qty < 1) {
    return 0;
  }
  return Math.round(qty) * priceCents;
}

/**
 * Whether a rationale-required order is complete enough to submit (9.1): at
 * least one chip selected, and the note (if any) within the 280-char limit.
 * Only meaningful when rationale is required (a buy with trade rationale
 * unlocked); callers skip it otherwise.
 */
export function isRationaleComplete(selectedTags: readonly string[], note: string): boolean {
  if (selectedTags.length < 1) {
    return false;
  }
  return note.length <= RATIONALE_NOTE_MAX;
}

/**
 * Whether the ticket's Place-order button should be enabled.
 *
 * Enabled when the quantity is a whole number >= 1, an order is not already in
 * flight, and — when rationale is required — the rationale is complete. The
 * server still re-validates everything (cash, cap, eligibility); this is only
 * the client-side guard that keeps the button from firing an obviously invalid
 * order.
 */
export function canSubmitOrder(params: {
  qty: number;
  pending: boolean;
  rationaleRequired: boolean;
  selectedTags: readonly string[];
  note: string;
}): boolean {
  const { qty, pending, rationaleRequired, selectedTags, note } = params;
  if (pending) {
    return false;
  }
  if (!Number.isInteger(qty) || qty < 1) {
    return false;
  }
  if (rationaleRequired && !isRationaleComplete(selectedTags, note)) {
    return false;
  }
  return true;
}

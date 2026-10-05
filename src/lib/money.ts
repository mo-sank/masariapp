/**
 * Money utilities operating on integer cents (requirements 4.4, 7.2).
 *
 * Money in this system is INTEGER CENTS everywhere: the database stores every
 * monetary column as `bigint` cents, the edge functions convert provider
 * dollars to cents exactly once at the ingest boundary
 * (supabase/functions/_shared/providers/cents.ts), and the client receives
 * those integers as JavaScript `number`s. This module is the client-side
 * mirror of that discipline: it formats cents for display, converts between
 * cents and dollars at the UI boundary, and computes gain/loss and percent
 * change — all without ever doing floating-point arithmetic on a stored money
 * value.
 *
 * The rule the server follows ("convert dollars to cents once, then only ever
 * do integer math on money") applies here too. The only place a float appears
 * is `parseDollarsToCents`, which turns a user-typed dollar string into cents
 * at the input boundary and rejects anything with sub-cent precision so a
 * rounding ambiguity can never enter the ledger.
 */

/** Thrown when a user-entered dollar string cannot be converted to cents. */
export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyParseError';
  }
}

/**
 * Format an integer number of cents as a US dollar currency string, e.g.
 * `123456` -> `"$1,234.56"`. Negative amounts render with a leading minus
 * (`-$1.00`), which callers use directly or strip when they show their own
 * sign (see `formatSignedCents`).
 *
 * Always shows exactly two decimal places and groups thousands with commas.
 * The input must be an integer; a non-integer indicates float math leaked onto
 * a money value upstream, which is a bug, so we throw rather than silently
 * display a rounded figure.
 */
export function formatCents(cents: number): string {
  assertIntegerCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = groupThousands(dollars);
  const fraction = remainder.toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${grouped}.${fraction}`;
}

/**
 * Format cents with an explicit leading sign and always-visible symbol, e.g.
 * `+$12.00` / `-$12.00` / `$0.00`. Used for gain/loss figures where the sign
 * carries meaning. Zero is rendered without a sign.
 */
export function formatSignedCents(cents: number): string {
  assertIntegerCents(cents);
  if (cents === 0) {
    return formatCents(0);
  }
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatCents(Math.abs(cents))}`;
}

/**
 * Convert integer cents to a dollars `number`, e.g. `12345` -> `123.45`. This
 * introduces floating point and so is for DISPLAY or charting only — never
 * feed the result back into money math. Prefer `formatCents` when you just
 * need a string.
 */
export function centsToDollars(cents: number): number {
  assertIntegerCents(cents);
  return cents / 100;
}

/**
 * Convert a dollars `number` to integer cents. Intended for internally
 * computed dollar values (e.g. a value derived in code), NOT for user input —
 * use `parseDollarsToCents` for strings a person typed. Snaps away binary
 * float noise the same way the server's cents helper does, then rounds to the
 * nearest whole cent.
 */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new MoneyParseError(`dollars is not a finite number: ${String(dollars)}`);
  }
  const centsFloat = Math.round(dollars * 100 * 1e6) / 1e6;
  return Math.round(centsFloat);
}

/**
 * Parse a user-typed dollar string into integer cents.
 *
 * Accepts an optional leading `$`, surrounding whitespace, thousands commas,
 * and 0, 1, or 2 decimal places (`"1,234"`, `"12.5"`, `"12.50"`). Rejects:
 * - empty / non-numeric input,
 * - negative amounts (orders are quantity-based; a negative dollar amount is
 *   never a valid entry),
 * - more than two decimal places, so a sub-cent value can never be silently
 *   rounded into the ledger (design: "rejects floats beyond 2 decimals").
 *
 * Because it works on the string's digits rather than parsing to a float and
 * multiplying, `"0.1"` + `"0.2"` style representation error is impossible.
 */
export function parseDollarsToCents(input: string): number {
  if (typeof input !== 'string') {
    throw new MoneyParseError(`expected a string, got ${typeof input}`);
  }
  const trimmed = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '') {
    throw new MoneyParseError('empty amount');
  }
  // Whole dollars, or dollars with 1–2 decimal places. No sign allowed.
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new MoneyParseError(`not a valid dollar amount: ${input}`);
  }
  const whole = match[1];
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents)) {
    throw new MoneyParseError(`amount is too large: ${input}`);
  }
  return cents;
}

/**
 * Percent change from `basisCents` to `currentCents`, expressed in BASIS
 * POINTS (hundredths of a percent) as an integer. For example a move from
 * `$100.00` to `$110.00` returns `1000` (10.00%). Returning an integer of
 * basis points keeps the computation exact; callers divide by 100 only when
 * formatting (see `formatPercent`).
 *
 * Returns `null` when `basisCents` is zero (percent change is undefined with
 * no basis), so callers can show a dash instead of dividing by zero.
 */
export function pctChange(currentCents: number, basisCents: number): number | null {
  assertIntegerCents(currentCents);
  assertIntegerCents(basisCents);
  if (basisCents === 0) {
    return null;
  }
  // (delta / basis) * 100% in basis points = delta / basis * 10000, rounded.
  return Math.round(((currentCents - basisCents) * 10000) / basisCents);
}

/**
 * Format basis points (as returned by `pctChange`) as a signed percent string,
 * e.g. `1000` -> `"+10.00%"`, `-525` -> `"-5.25%"`, `0` -> `"0.00%"`. A `null`
 * basis-points value (undefined percent change) renders as `"—"`.
 */
export function formatPercent(basisPoints: number | null): string {
  if (basisPoints === null) {
    return '—';
  }
  const abs = Math.abs(basisPoints);
  const whole = Math.floor(abs / 100);
  const fraction = (abs % 100).toString().padStart(2, '0');
  const sign = basisPoints > 0 ? '+' : basisPoints < 0 ? '-' : '';
  return `${sign}${whole}.${fraction}%`;
}

/**
 * The unrealized value and gain/loss of a position, all in integer cents, plus
 * the percent change in basis points. Used by the portfolio screen
 * (requirement 7.2): a row shows value and unrealized gain/loss in dollars and
 * percent, computed from integer cents.
 */
export interface GainLoss {
  /** Current market value: `qty * currentPriceCents`. */
  valueCents: number;
  /** Gain or loss versus cost basis, in cents (positive = gain). */
  gainCents: number;
  /** Percent change versus cost basis, in basis points, or null if basis is 0. */
  gainBasisPoints: number | null;
}

/**
 * Compute a position's current value and unrealized gain/loss from integer
 * cents. `costBasisCents` is the TOTAL cost of the holding (matching the
 * `positions.cost_basis_cents` column, which stores total cost, not per
 * share). All arithmetic is integer-only.
 */
export function computeGainLoss(
  qty: number,
  currentPriceCents: number,
  costBasisCents: number,
): GainLoss {
  assertIntegerCents(currentPriceCents);
  assertIntegerCents(costBasisCents);
  if (!Number.isInteger(qty)) {
    throw new MoneyParseError(`qty must be an integer, got ${qty}`);
  }
  const valueCents = qty * currentPriceCents;
  const gainCents = valueCents - costBasisCents;
  return {
    valueCents,
    gainCents,
    gainBasisPoints: pctChange(valueCents, costBasisCents),
  };
}

/** Group a non-negative integer dollar amount with thousands commas. */
function groupThousands(dollars: number): string {
  return dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Guard that a value is an integer cent amount; throws otherwise. */
function assertIntegerCents(cents: number): void {
  if (!Number.isInteger(cents)) {
    throw new MoneyParseError(`cents must be an integer, got ${String(cents)}`);
  }
}

// Dollars -> integer cents conversion at the provider boundary.
//
// Money in this system is INTEGER CENTS everywhere (bigint in SQL, number in
// TS). Providers return floating-point dollars, so we convert EXACTLY ONCE here,
// at the ingest boundary (docs/db-and-api-reference.md section 7.1:
// `Math.round(price * 100)`), and never do float math on money again.
//
// Why `Math.round(x * 100)` is not enough on its own: binary floating point
// cannot represent many decimal dollar values exactly, so `19.99 * 100` is
// `1998.9999999999998`. Plain rounding happens to work for that case, but values
// like `1.005 * 100` land on `100.49999999999999` and round DOWN to 100 cents
// instead of the intended 101. We fix that by scaling to cents FIRST, snapping
// that product to six decimal places to erase the representation error, and only
// then rounding to an integer. That makes the common 2- and 4-decimal provider
// values convert deterministically (1.005 -> 101, 2.675 -> 268).

/** Thrown when a provider dollar value cannot be converted to valid cents. */
export class CentsConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CentsConversionError';
  }
}

/**
 * Convert a provider dollar amount to a non-negative integer number of cents.
 *
 * Rejects non-finite values (NaN, Infinity) and negative amounts, which must
 * never reach the `quotes`/`quote_bars` tables (requirement 2.3: never write a
 * zero or null — and here, never a bogus — price). Returns an integer.
 *
 * Rounds the half-cent up (`Math.round`, which for our non-negative domain is
 * round-half-up), after erasing floating-point noise from the cent product.
 */
export function dollarsToCents(dollars: number): number {
  if (typeof dollars !== 'number' || !Number.isFinite(dollars)) {
    throw new CentsConversionError(`price is not a finite number: ${String(dollars)}`);
  }
  if (dollars < 0) {
    throw new CentsConversionError(`price is negative: ${dollars}`);
  }
  // Scale to cents first, snap that product to six decimal places to erase
  // binary-float noise, then round to the nearest whole cent.
  const centsFloat = Math.round(dollars * 100 * 1e6) / 1e6;
  const cents = Math.round(centsFloat);
  // Math.round can only produce a non-integer if given a non-finite input,
  // which we already rejected; assert defensively for the type contract.
  if (!Number.isInteger(cents)) {
    throw new CentsConversionError(`conversion did not yield an integer: ${cents}`);
  }
  return cents;
}

/**
 * Convert a strictly positive provider price to integer cents.
 *
 * The ledger and the `quotes.price_cents > 0` check require positive prices, so
 * this rejects zero in addition to the checks in `dollarsToCents`. Use this for
 * the primary quote/bar prices; use `dollarsToCents` for optional fields that
 * are allowed to be zero (e.g. a session low on a day with no trades).
 */
export function positiveDollarsToCents(dollars: number): number {
  const cents = dollarsToCents(dollars);
  if (cents <= 0) {
    throw new CentsConversionError(`price must be greater than zero, got ${dollars}`);
  }
  return cents;
}

/**
 * Convert an optional provider dollar value to integer cents, or `undefined`
 * when the provider omitted it (null/undefined). A present-but-invalid value
 * still throws, so bad data is never silently dropped.
 */
export function optionalDollarsToCents(dollars: number | null | undefined): number | undefined {
  if (dollars === null || dollars === undefined) {
    return undefined;
  }
  return dollarsToCents(dollars);
}

/**
 * Format an allocation/exposure SHARE expressed in basis points (0–10000) as an
 * unsigned percent, e.g. 7500 -> "75.0%".
 *
 * `src/lib/money.ts`'s `formatPercent` is for signed CHANGE (it prepends "+"),
 * which reads wrong for a share-of-whole. This keeps the allocation legends and
 * exposure rows reading as plain proportions while still deriving from the
 * integer basis-point values the analysis layer computes.
 */
export function formatShare(basisPoints: number): string {
  const clamped = Math.max(0, basisPoints);
  const whole = Math.floor(clamped / 100);
  const fraction = Math.round(clamped % 100 / 10);
  // Carry a rounded .10 back into the whole part (e.g. 99.95% -> 100.0%).
  if (fraction === 10) {
    return `${whole + 1}.0%`;
  }
  return `${whole}.${fraction}%`;
}

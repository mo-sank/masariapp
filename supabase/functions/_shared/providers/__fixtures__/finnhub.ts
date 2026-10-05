// Recorded Finnhub API responses for provider tests. No live calls are made in
// CI (design: "Provider tests with recorded fixtures"). These were captured from
// the shapes documented at https://finnhub.io/docs/api and trimmed to the fields
// the provider reads. Prices are illustrative, not real market data.

/** A well-formed /quote response (AAPL-like). c=current, pc=prev close. */
export const quoteOk = {
  c: 189.95,
  d: 1.23,
  dp: 0.65,
  h: 190.4,
  l: 188.1,
  o: 188.5,
  pc: 188.72,
  t: 1_712_000_000, // 2024-04-01T18:13:20Z
};

/** A /quote whose decimal triggers float rounding edge cases (1.005 -> 101c). */
export const quoteRoundingEdge = {
  c: 1.005,
  pc: 2.675,
  o: 0,
  h: 0,
  l: 0,
  t: 1_712_000_000,
};

/** A /quote for an unknown/halted symbol: Finnhub returns zeros. */
export const quoteNoData = {
  c: 0,
  d: null,
  dp: null,
  h: 0,
  l: 0,
  o: 0,
  pc: 0,
  t: 0,
};

/** A /quote missing the required `c` field entirely (malformed). */
export const quoteMalformed = {
  d: 1.23,
  pc: 188.72,
  t: 1_712_000_000,
};

/** A well-formed daily /stock/candle response with three bars. */
export const candleOk = {
  s: 'ok',
  t: [1_711_929_600, 1_712_016_000, 1_712_102_400], // 2024-04-01..04-03 UTC
  o: [188.5, 190.1, 191.0],
  h: [190.4, 191.8, 192.3],
  l: [187.9, 189.6, 190.2],
  c: [189.95, 191.2, 191.75],
  v: [52_000_000, 48_500_000, 50_100_000],
};

/** A /stock/candle response for a symbol with no data in the range. */
export const candleNoData = {
  s: 'no_data',
};

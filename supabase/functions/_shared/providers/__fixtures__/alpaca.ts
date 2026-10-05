// Recorded Alpaca /v2/stocks/bars responses for provider tests. No live calls
// are made in CI (design: "Provider tests with recorded fixtures"). Shapes were
// captured from a real response and trimmed to the fields the provider reads.
// Prices are illustrative, not real market data.

/** A single-page response with three AAPL daily bars, ascending by t. */
export const barsOnePage = {
  bars: {
    AAPL: [
      { t: '2026-09-01T04:00:00Z', o: 316.97, h: 327.3, l: 314.73, c: 325.25, v: 1_709_875, n: 32_369, vw: 324.03 },
      { t: '2026-09-02T04:00:00Z', o: 327.01, h: 328.36, l: 323.57, c: 325.03, v: 1_152_718, n: 23_120, vw: 325.31 },
      { t: '2026-09-03T04:00:00Z', o: 324.91, h: 330.79, l: 324.15, c: 328.22, v: 1_042_722, n: 21_022, vw: 328.2 },
    ],
  },
  next_page_token: null,
};

/** First page of a two-page response (carries a next_page_token). */
export const barsPage1 = {
  bars: {
    AAPL: [
      { t: '2026-09-01T04:00:00Z', o: 316.97, h: 327.3, l: 314.73, c: 325.25, v: 1_709_875 },
      { t: '2026-09-02T04:00:00Z', o: 327.01, h: 328.36, l: 323.57, c: 325.03, v: 1_152_718 },
    ],
  },
  next_page_token: 'PAGE2',
};

/** Second (final) page; next_page_token is null so pagination stops. */
export const barsPage2 = {
  bars: {
    AAPL: [{ t: '2026-09-03T04:00:00Z', o: 324.91, h: 330.79, l: 324.15, c: 328.22, v: 1_042_722 }],
  },
  next_page_token: null,
};

/** A response for a symbol with no data in the requested range. */
export const barsNoData = {
  bars: {},
  next_page_token: null,
};

/**
 * A response that also contains bars for an UNREQUESTED symbol. The provider
 * must only read the key for the symbol it asked for and ignore the rest (the
 * endpoint is multi-symbol; a single-symbol query returns a single key, but we
 * assert the lookup-by-symbol behavior is strict).
 */
export const barsExtraSymbol = {
  bars: {
    AAPL: [{ t: '2026-09-01T04:00:00Z', o: 316.97, h: 327.3, l: 314.73, c: 325.25, v: 1_709_875 }],
    MSFT: [{ t: '2026-09-01T04:00:00Z', o: 500.0, h: 505.0, l: 498.0, c: 503.0, v: 900_000 }],
  },
  next_page_token: null,
};

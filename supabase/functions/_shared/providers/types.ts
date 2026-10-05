// Market-data provider interface (docs/db-and-api-reference.md section 7.1).
//
// The app NEVER calls a market-data provider directly. The ingest-quotes and
// ingest-bars Edge Functions call a provider through this interface and write
// the results to the `quotes` and `quote_bars` tables (requirement 2.5: when
// the provider is swapped, only the provider implementation changes).
//
// Boundary contract:
//   - Prices in ProviderQuote/ProviderBar are PROVIDER DOLLARS (floating point,
//     as the provider returns them). They are converted to integer cents EXACTLY
//     ONCE, at the ingest boundary, with `dollarsToCents` in ./cents.ts. The DB
//     stores integer cents (bigint); the client formats only at the UI edge.
//   - `asOf` / `date` are provider timestamps as ISO 8601 strings (UTC). The
//     ingest function writes them to `quotes.as_of` / `quote_bars.bar_date`.
//
// Requirement 2.6: each quote row records `as_of`, `is_delayed`, and `source`.
// `as_of` comes from ProviderQuote.asOf; `source` comes from
// QuoteProvider.name; `is_delayed` is decided by the ingest function (the MVP
// uses delayed data, so it is true).

/** A single delayed quote snapshot for one symbol, in provider dollars. */
export interface ProviderQuote {
  /** Instrument symbol, upper-case (e.g. "AAPL"). Matches instruments.symbol. */
  symbol: string;
  /** Latest price in dollars. Must be finite and > 0; validated downstream. */
  price: number;
  /** Previous session close in dollars, when the provider supplies it. */
  prevClose?: number;
  /** Session open in dollars. */
  open?: number;
  /** Session high in dollars. */
  high?: number;
  /** Session low in dollars. */
  low?: number;
  /** Session volume in shares (whole number). */
  volume?: number;
  /** Provider timestamp for the quote, ISO 8601 (UTC). */
  asOf: string;
}

/** A single daily OHLC bar for one symbol, in provider dollars. */
export interface ProviderBar {
  /** Trading date, ISO 8601 date (YYYY-MM-DD). */
  date: string;
  /** Open in dollars. */
  open: number;
  /** High in dollars. */
  high: number;
  /** Low in dollars. */
  low: number;
  /** Close in dollars. */
  close: number;
  /** Volume in shares (whole number). */
  volume?: number;
}

/**
 * A market-data provider. One implementation is selected at runtime by
 * `getProvider()` (see ./index.ts) from the `PROVIDER` env var, so swapping
 * providers touches only the implementation and that switch — never the ingest
 * functions or the app (requirement 2.5).
 */
export interface QuoteProvider {
  /** Stable identifier written to `quotes.source` (e.g. "finnhub"). */
  name: string;
  /**
   * Fetch latest snapshots for the given symbols. Implementations MUST respect
   * their free-tier rate limit (batching / pacing / backoff) and MAY return
   * fewer entries than requested when a symbol has no data — callers keep the
   * last-known-good row for a missing symbol (requirement 2.3) and never write
   * a zero or null price.
   */
  getSnapshots(symbols: string[]): Promise<ProviderQuote[]>;
  /**
   * Fetch daily bars for one symbol over the inclusive [from, to] date range
   * (ISO 8601 dates). Used by ingest-bars for backfill and the nightly append.
   */
  getDailyBars(symbol: string, from: string, to: string): Promise<ProviderBar[]>;
}

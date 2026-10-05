// Core logic for the ingest-bars Edge Function, separated from the HTTP wrapper
// (index.ts) so it can be unit-tested without a live Supabase stack or a real
// market-data provider. Everything the core touches — the provider, the
// active-symbol list, the quote_bars upsert, the resumable progress store, the
// logger, and the clock — is injected via `IngestBarsDeps`.
//
// Requirements covered here (docs/db-and-api-reference.md sections 3.3, 7;
// requirements 3.1, 3.2):
//   3.1 In backfill mode, load up to N (default 5) years of daily bars for each
//       active instrument into public.quote_bars. The backfill is per-symbol,
//       rate-limit aware, and RESUMABLE: progress is recorded per symbol so a
//       re-run after an interruption continues instead of refetching symbols it
//       already finished (design.md "ingest-bars").
//   3.2 In nightly mode, append the latest daily bar(s) for each active
//       instrument.
//
// In both modes bars are upserted on (symbol, bar_date), so a re-run that
// overlaps previously written dates is idempotent. Dollars are converted to
// integer cents exactly once here, at the boundary, with the cents helpers.
//
// The x-cron-secret check (requirement 2.4, shared with ingest-quotes) and
// verify_jwt = false live in the HTTP wrapper and config.toml respectively.
import type { ProviderBar, QuoteProvider } from '../_shared/providers/types.ts';
import { CentsConversionError, dollarsToCents, positiveDollarsToCents } from '../_shared/providers/cents.ts';

/** A row ready to upsert into public.quote_bars. Money is already integer cents. */
export interface QuoteBarRow {
  symbol: string;
  bar_date: string; // ISO date (YYYY-MM-DD)
  open_cents: number;
  high_cents: number;
  low_cents: number;
  close_cents: number;
  volume: number | null;
}

/** Minimal structured logger; the wrapper passes one backed by console. */
export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** The two run modes. `backfill` loads history; `nightly` appends the latest bar. */
export type IngestBarsMode = 'backfill' | 'nightly';

/** Parsed, validated request body for a run. */
export interface IngestBarsRequest {
  mode: IngestBarsMode;
  /** Backfill horizon in whole years (backfill mode only). */
  years: number;
}

/**
 * Everything the core needs, injected so tests can supply fakes.
 *
 * `progress` is only used by backfill: it records which symbols have already
 * been loaded for a given backfill window so an interrupted run can resume
 * (requirement 3.1). Nightly runs do not touch it.
 */
export interface IngestBarsDeps {
  /** The configured market-data provider (from getProvider()). */
  provider: QuoteProvider;
  /** Active instrument symbols to load (instruments.is_active = true). */
  listActiveSymbols(): Promise<string[]>;
  /**
   * Upsert the given bar rows into public.quote_bars (on conflict
   * (symbol, bar_date) do update). Only ever called with validated rows whose
   * OHLC prices are positive integer cents.
   */
  upsertBars(rows: QuoteBarRow[]): Promise<void>;
  /** Symbols already completed for backfill window `windowKey`. */
  listCompletedSymbols(windowKey: string): Promise<string[]>;
  /** Record that `symbol` finished its backfill for window `windowKey`. */
  markSymbolComplete(windowKey: string, symbol: string, barsWritten: number): Promise<void>;
  logger: Logger;
  /** Clock, injectable for deterministic tests. Defaults to Date in the wrapper. */
  now(): Date;
}

/** Per-symbol outcome, surfaced in the run result for log review. */
export interface SymbolOutcome {
  symbol: string;
  /** Rows upserted for this symbol in this run (0 when skipped or empty). */
  barsWritten: number;
  /** True when the symbol was skipped because it was already complete. */
  resumedSkip: boolean;
  /** Error message when the symbol failed; absent on success. */
  error?: string;
}

/** Outcome of a run, returned to the HTTP wrapper and used as the JSON body. */
export interface IngestBarsResult {
  mode: IngestBarsMode;
  /** Inclusive date range requested from the provider (ISO dates). */
  from: string;
  to: string;
  /** Backfill window key (backfill mode only); identifies the resume cohort. */
  windowKey?: string;
  /** Number of active symbols considered this run. */
  requested: number;
  /** Symbols skipped because they were already complete (backfill resume). */
  skipped: number;
  /** Symbols that finished successfully this run. */
  completed: number;
  /** Symbols that errored this run (kept for a later retry). */
  failed: number;
  /** Total bar rows upserted across all symbols. */
  barsWritten: number;
  /** Per-symbol detail. */
  symbols: SymbolOutcome[];
}

/** Default backfill horizon (requirement 3.1: "up to 5 years"). */
export const DEFAULT_BACKFILL_YEARS = 5;
/** Maximum accepted backfill horizon, to bound provider usage. */
export const MAX_BACKFILL_YEARS = 25;

/**
 * How far back a nightly run asks the provider to look. A few days of overlap
 * (rather than exactly one day) means a long weekend or a missed night still
 * backfills the gap, and the (symbol, bar_date) upsert makes the overlap
 * harmless/idempotent (requirement 3.2).
 */
const NIGHTLY_LOOKBACK_DAYS = 5;

/** Thrown when an incoming request body cannot be parsed into a valid request. */
export class IngestBarsRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestBarsRequestError';
  }
}

/**
 * Parse and validate a request body into an IngestBarsRequest. Defaults to
 * nightly mode with no body, matching the cron payload `{"mode":"nightly"}` and
 * the manual backfill payload `{"mode":"backfill","years":5}` from the DB
 * reference (section 7). Throws IngestBarsRequestError on malformed input so the
 * wrapper can answer 400 rather than run with surprising parameters.
 */
export function parseRequest(body: unknown): IngestBarsRequest {
  const raw = (body ?? {}) as Record<string, unknown>;

  const modeValue = raw.mode === undefined ? 'nightly' : raw.mode;
  if (modeValue !== 'nightly' && modeValue !== 'backfill') {
    throw new IngestBarsRequestError(`invalid mode: ${String(modeValue)} (expected "nightly" or "backfill")`);
  }
  const mode = modeValue as IngestBarsMode;

  let years = DEFAULT_BACKFILL_YEARS;
  if (raw.years !== undefined) {
    const parsed = typeof raw.years === 'number' ? raw.years : Number(raw.years);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_BACKFILL_YEARS) {
      throw new IngestBarsRequestError(
        `invalid years: ${String(raw.years)} (expected an integer 1..${MAX_BACKFILL_YEARS})`,
      );
    }
    years = parsed;
  }

  return { mode, years };
}

/** Format a Date as an ISO date (YYYY-MM-DD) in UTC. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Compute the inclusive [from, to] date range for a run. */
function dateRange(request: IngestBarsRequest, now: Date): { from: string; to: string } {
  const to = toIsoDate(now);
  const start = new Date(now.getTime());
  if (request.mode === 'backfill') {
    start.setUTCFullYear(start.getUTCFullYear() - request.years);
  } else {
    start.setUTCDate(start.getUTCDate() - NIGHTLY_LOOKBACK_DAYS);
  }
  return { from: toIsoDate(start), to };
}

/**
 * Run one ingest-bars cycle. Pure with respect to its injected dependencies.
 *
 * Backfill (requirement 3.1):
 *   1. Compute the [from, to] window (now minus `years`), and a stable
 *      windowKey from it.
 *   2. Load the set of symbols already completed for that windowKey and skip
 *      them, so an interrupted run resumes where it left off.
 *   3. For every remaining active symbol, fetch its daily bars, convert to
 *      integer-cent rows, upsert, then mark the symbol complete. A single
 *      symbol's failure is isolated and recorded, never aborting the run; it is
 *      simply not marked complete, so a later run retries it.
 *
 * Nightly (requirement 3.2):
 *   For every active symbol, fetch the last few days of bars and upsert the
 *   latest one(s). No progress tracking — nightly is cheap and idempotent.
 */
export async function runIngestBars(request: IngestBarsRequest, deps: IngestBarsDeps): Promise<IngestBarsResult> {
  const now = deps.now();
  const { from, to } = dateRange(request, now);

  const symbols = await deps.listActiveSymbols();
  const normalized = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0))].sort();

  const result: IngestBarsResult = {
    mode: request.mode,
    from,
    to,
    requested: normalized.length,
    skipped: 0,
    completed: 0,
    failed: 0,
    barsWritten: 0,
    symbols: [],
  };

  if (normalized.length === 0) {
    deps.logger.warn('ingest-bars found no active instruments');
    return result;
  }

  // Backfill resume: load the already-completed set for this window.
  let completedSet = new Set<string>();
  let windowKey: string | undefined;
  if (request.mode === 'backfill') {
    windowKey = `${from}_${to}`;
    result.windowKey = windowKey;
    const done = await deps.listCompletedSymbols(windowKey);
    completedSet = new Set(done.map((s) => s.trim().toUpperCase()));
    deps.logger.info('ingest-bars backfill starting', {
      windowKey,
      years: request.years,
      requested: normalized.length,
      alreadyComplete: completedSet.size,
    });
  }

  for (const symbol of normalized) {
    // Resume: skip a symbol already finished for this backfill window.
    if (request.mode === 'backfill' && completedSet.has(symbol)) {
      result.skipped += 1;
      result.symbols.push({ symbol, barsWritten: 0, resumedSkip: true });
      continue;
    }

    try {
      const providerBars = await deps.provider.getDailyBars(symbol, from, to);
      const rows = toBarRows(symbol, providerBars, deps.logger);

      if (rows.length > 0) {
        await deps.upsertBars(rows);
      }

      // Mark complete only after a successful upsert, so an interrupted run
      // never records a symbol it did not finish (requirement 3.1).
      if (request.mode === 'backfill' && windowKey) {
        await deps.markSymbolComplete(windowKey, symbol, rows.length);
      }

      result.completed += 1;
      result.barsWritten += rows.length;
      result.symbols.push({ symbol, barsWritten: rows.length, resumedSkip: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed += 1;
      result.symbols.push({ symbol, barsWritten: 0, resumedSkip: false, error: message });
      deps.logger.error('ingest-bars failed for a symbol; it will be retried on the next run', {
        symbol,
        mode: request.mode,
        error: message,
      });
      // Do not rethrow: isolate the failure so the rest of the universe loads.
    }
  }

  deps.logger.info('ingest-bars complete', {
    mode: request.mode,
    from,
    to,
    requested: result.requested,
    skipped: result.skipped,
    completed: result.completed,
    failed: result.failed,
    barsWritten: result.barsWritten,
  });

  return result;
}

/**
 * Map one symbol's provider bars to validated quote_bars rows, converting
 * dollars to integer cents exactly once. A bar whose close is missing/non-positive
 * or whose OHLC is otherwise unconvertible is dropped (and logged) rather than
 * written with a bogus value — quote_bars columns are NOT NULL, so we never
 * fabricate a price. Returns the rows in ascending bar_date order.
 */
export function toBarRows(symbol: string, bars: ProviderBar[], logger: Logger): QuoteBarRow[] {
  const sym = symbol.trim().toUpperCase();
  const rows: QuoteBarRow[] = [];

  for (const bar of bars) {
    const row = toBarRow(sym, bar, logger);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => (a.bar_date < b.bar_date ? -1 : a.bar_date > b.bar_date ? 1 : 0));
  return rows;
}

/** Map a single provider bar to a validated row, or null when it is unusable. */
export function toBarRow(symbol: string, bar: ProviderBar, logger: Logger): QuoteBarRow | null {
  const barDate = typeof bar.date === 'string' ? bar.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(barDate)) {
    logger.warn('ingest-bars dropped a bar with an invalid date', { symbol, date: String(bar.date) });
    return null;
  }

  try {
    // Close must be strictly positive; open/high/low are allowed to be any
    // non-negative value but must convert cleanly (a present-but-invalid value
    // throws, so bad data is dropped, not written).
    const closeCents = positiveDollarsToCents(bar.close);
    const openCents = dollarsToCents(bar.open);
    const highCents = dollarsToCents(bar.high);
    const lowCents = dollarsToCents(bar.low);
    const volume = normalizeVolume(bar.volume);

    return {
      symbol,
      bar_date: barDate,
      open_cents: openCents,
      high_cents: highCents,
      low_cents: lowCents,
      close_cents: closeCents,
      volume,
    };
  } catch (err) {
    const reason = err instanceof CentsConversionError ? err.message : String(err);
    logger.warn('ingest-bars dropped an invalid bar', { symbol, date: barDate, reason });
    return null;
  }
}

/** Coerce a provider volume to a non-negative whole number, or null. */
function normalizeVolume(volume: number | undefined): number | null {
  if (volume === undefined || !Number.isFinite(volume) || volume < 0) {
    return null;
  }
  return Math.trunc(volume);
}

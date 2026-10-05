// Provider selection. `getProvider()` reads env vars and returns a QuoteProvider,
// so swapping or splitting providers is a config change — no edits to the ingest
// functions or the app (requirement 2.5).
//
// Two axes:
//   - PROVIDER (default "finnhub"): the provider used for QUOTES (getSnapshots).
//   - BARS_PROVIDER (optional): when set, the provider used for daily BARS
//     (getDailyBars) INSTEAD of the quotes provider. This split exists because
//     Finnhub's free tier serves quotes but 403s on historical candles, while
//     Alpaca's free tier serves daily bars. With PROVIDER=finnhub and
//     BARS_PROVIDER=alpaca, quotes come from Finnhub and bars from Alpaca, and
//     ingest-quotes (which only calls getSnapshots) is unaffected.
//
// Supported values (case-insensitive):
//   - PROVIDER=finnhub (default): FinnhubProvider, key from MARKET_DATA_API_KEY.
//   - BARS_PROVIDER=alpaca: AlpacaProvider, creds from ALPACA_API_KEY_ID and
//     ALPACA_API_SECRET_KEY (free-tier IEX daily bars, ~15 min delayed).
//
// When BARS_PROVIDER is unset the returned provider is exactly the single
// PROVIDER instance for both quotes and bars (fully backward compatible).
import { AlpacaProvider } from './alpaca.ts';
import { FinnhubProvider } from './finnhub.ts';
import type { ProviderBar, ProviderQuote, QuoteProvider } from './types.ts';

export type { ProviderBar, ProviderQuote, QuoteProvider } from './types.ts';
export {
  CentsConversionError,
  dollarsToCents,
  optionalDollarsToCents,
  positiveDollarsToCents,
} from './cents.ts';
export { FinnhubProvider } from './finnhub.ts';
export { AlpacaProvider } from './alpaca.ts';

/** Reads an env var; defaults to Deno.env but is injectable for tests. */
export type EnvReader = (key: string) => string | undefined;

const defaultEnv: EnvReader = (key) => {
  // `Deno` is only defined in the Edge runtime; guard so this module can also be
  // imported by tooling that passes its own reader.
  return typeof Deno !== 'undefined' ? Deno.env.get(key) : undefined;
};

/**
 * A provider that delegates quotes and bars to two different backends. Used when
 * BARS_PROVIDER is set, so quotes keep coming from the configured quotes
 * provider while bars come from a bars-capable one.
 */
class CompositeProvider implements QuoteProvider {
  readonly name: string;
  readonly #quotes: QuoteProvider;
  readonly #bars: QuoteProvider;

  constructor(quotes: QuoteProvider, bars: QuoteProvider) {
    this.#quotes = quotes;
    this.#bars = bars;
    // e.g. "finnhub+alpaca" — written to rows that record a provider source.
    this.name = `${quotes.name}+${bars.name}`;
  }

  getSnapshots(symbols: string[]): Promise<ProviderQuote[]> {
    return this.#quotes.getSnapshots(symbols);
  }

  getDailyBars(symbol: string, from: string, to: string): Promise<ProviderBar[]> {
    return this.#bars.getDailyBars(symbol, from, to);
  }
}

/** Build the QUOTES provider from the PROVIDER env var (default finnhub). */
function getQuotesProvider(env: EnvReader): QuoteProvider {
  const name = (env('PROVIDER') ?? 'finnhub').trim().toLowerCase();
  switch (name) {
    case 'finnhub': {
      const apiKey = env('MARKET_DATA_API_KEY');
      if (!apiKey) {
        throw new Error('MARKET_DATA_API_KEY is required for the finnhub provider');
      }
      return new FinnhubProvider({ apiKey });
    }
    default:
      throw new Error(`Unknown PROVIDER "${name}". Supported: finnhub.`);
  }
}

/** Build the BARS provider from the BARS_PROVIDER env var. */
function getBarsProvider(name: string, env: EnvReader): QuoteProvider {
  switch (name) {
    case 'alpaca': {
      const keyId = env('ALPACA_API_KEY_ID');
      const secretKey = env('ALPACA_API_SECRET_KEY');
      if (!keyId || !secretKey) {
        throw new Error(
          'ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY are required for the alpaca bars provider',
        );
      }
      return new AlpacaProvider({ keyId, secretKey });
    }
    default:
      throw new Error(`Unknown BARS_PROVIDER "${name}". Supported: alpaca.`);
  }
}

/**
 * Build the configured QuoteProvider. Throws if required secrets are missing or
 * a provider name is unknown, so misconfiguration fails fast at startup rather
 * than silently fetching nothing.
 *
 * When BARS_PROVIDER is unset, returns the single quotes provider for both
 * quotes and bars (backward compatible). When set, returns a CompositeProvider
 * that routes getSnapshots -> quotes provider and getDailyBars -> bars provider.
 */
export function getProvider(env: EnvReader = defaultEnv): QuoteProvider {
  const quotes = getQuotesProvider(env);

  const barsName = (env('BARS_PROVIDER') ?? '').trim().toLowerCase();
  if (barsName === '') {
    return quotes;
  }
  const bars = getBarsProvider(barsName, env);
  return new CompositeProvider(quotes, bars);
}

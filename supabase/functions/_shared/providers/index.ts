// Provider selection. `getProvider()` reads the `PROVIDER` env var and returns
// the matching QuoteProvider implementation, so swapping providers is a config
// change — no edits to the ingest functions or the app (requirement 2.5).
//
// Supported values (case-insensitive):
//   - "finnhub" (default): FinnhubProvider, API key from MARKET_DATA_API_KEY.
//
// Alternate providers (Alpaca, Twelve Data, Massive/Polygon paid) would each add
// a branch here plus their own `<provider>.ts`; nothing else changes.
import { FinnhubProvider } from './finnhub.ts';
import type { QuoteProvider } from './types.ts';

export type { ProviderBar, ProviderQuote, QuoteProvider } from './types.ts';
export {
  CentsConversionError,
  dollarsToCents,
  optionalDollarsToCents,
  positiveDollarsToCents,
} from './cents.ts';
export { FinnhubProvider } from './finnhub.ts';

/** Reads an env var; defaults to Deno.env but is injectable for tests. */
export type EnvReader = (key: string) => string | undefined;

const defaultEnv: EnvReader = (key) => {
  // `Deno` is only defined in the Edge runtime; guard so this module can also be
  // imported by tooling that passes its own reader.
  return typeof Deno !== 'undefined' ? Deno.env.get(key) : undefined;
};

/**
 * Build the configured QuoteProvider. Throws if required secrets are missing or
 * the `PROVIDER` value is unknown, so misconfiguration fails fast at startup
 * rather than silently fetching nothing.
 */
export function getProvider(env: EnvReader = defaultEnv): QuoteProvider {
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

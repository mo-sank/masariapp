// Deno tests for getProvider() selection and config validation.
// Run with: deno test supabase/functions/_shared/providers/
import { assertEquals, assertThrows } from 'jsr:@std/assert@^1';

import { AlpacaProvider, FinnhubProvider, getProvider } from './index.ts';

/** Build an env reader from a plain record. */
function env(map: Record<string, string>) {
  return (key: string) => map[key];
}

Deno.test('getProvider defaults to finnhub when PROVIDER is unset', () => {
  const provider = getProvider(env({ MARKET_DATA_API_KEY: 'k' }));
  assertEquals(provider.name, 'finnhub');
  assertEquals(provider instanceof FinnhubProvider, true);
});

Deno.test('getProvider selects finnhub case-insensitively', () => {
  const provider = getProvider(env({ PROVIDER: 'FinnHub', MARKET_DATA_API_KEY: 'k' }));
  assertEquals(provider.name, 'finnhub');
});

Deno.test('getProvider throws when the finnhub api key is missing', () => {
  assertThrows(() => getProvider(env({ PROVIDER: 'finnhub' })), Error, 'MARKET_DATA_API_KEY');
});

Deno.test('getProvider throws on an unknown provider name', () => {
  assertThrows(() => getProvider(env({ PROVIDER: 'bloomberg' })), Error, 'Unknown PROVIDER');
});

Deno.test('getProvider returns the single quotes provider when BARS_PROVIDER is unset', () => {
  const provider = getProvider(env({ PROVIDER: 'finnhub', MARKET_DATA_API_KEY: 'k' }));
  // Backward compatible: the finnhub provider serves both quotes and bars.
  assertEquals(provider instanceof FinnhubProvider, true);
  assertEquals(provider.name, 'finnhub');
});

Deno.test('getProvider composes finnhub quotes + alpaca bars when BARS_PROVIDER=alpaca', () => {
  const provider = getProvider(
    env({
      PROVIDER: 'finnhub',
      MARKET_DATA_API_KEY: 'k',
      BARS_PROVIDER: 'alpaca',
      ALPACA_API_KEY_ID: 'PK',
      ALPACA_API_SECRET_KEY: 's',
    }),
  );
  // The composite reports both backends and is neither raw provider.
  assertEquals(provider.name, 'finnhub+alpaca');
  assertEquals(provider instanceof FinnhubProvider, false);
  assertEquals(provider instanceof AlpacaProvider, false);
});

Deno.test('getProvider throws when alpaca bars creds are missing', () => {
  assertThrows(
    () =>
      getProvider(
        env({ PROVIDER: 'finnhub', MARKET_DATA_API_KEY: 'k', BARS_PROVIDER: 'alpaca' }),
      ),
    Error,
    'ALPACA_API_KEY_ID',
  );
});

Deno.test('getProvider throws on an unknown BARS_PROVIDER name', () => {
  assertThrows(
    () =>
      getProvider(
        env({ PROVIDER: 'finnhub', MARKET_DATA_API_KEY: 'k', BARS_PROVIDER: 'polygon' }),
      ),
    Error,
    'Unknown BARS_PROVIDER',
  );
});

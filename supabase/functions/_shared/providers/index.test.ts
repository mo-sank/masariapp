// Deno tests for getProvider() selection and config validation.
// Run with: deno test supabase/functions/_shared/providers/
import { assertEquals, assertThrows } from 'jsr:@std/assert@^1';

import { FinnhubProvider, getProvider } from './index.ts';

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

// Deno tests for the ingest-bars HTTP wrapper: method handling, the
// x-cron-secret gate (requirement 2.4), and request-body validation. These
// exercise the paths that return before any Supabase or provider call, so no
// live stack is needed.
// Run with: deno test --allow-env supabase/functions/ingest-bars/
import { assertEquals } from 'jsr:@std/assert@^1';

import handler from './index.ts';

const CRON_SECRET = 'test-cron-secret-value';

/** Set the env the wrapper needs, run `fn`, then restore. */
async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = Deno.env.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function post(headers: Record<string, string> = {}, body?: string): Request {
  return new Request('http://localhost/functions/v1/ingest-bars', { method: 'POST', headers, body });
}

Deno.test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const res = await handler.fetch(new Request('http://localhost/', { method: 'OPTIONS' }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

Deno.test('non-POST methods are rejected with 405', async () => {
  const res = await handler.fetch(new Request('http://localhost/', { method: 'GET' }));
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, 'method_not_allowed');
});

Deno.test('missing CRON_SECRET config returns 500 before authenticating', async () => {
  await withEnv({ CRON_SECRET: undefined }, async () => {
    const res = await handler.fetch(post({ 'x-cron-secret': 'anything' }));
    assertEquals(res.status, 500);
    assertEquals((await res.json()).error, 'server_misconfigured');
  });
});

Deno.test('wrong x-cron-secret returns 401', async () => {
  await withEnv({ CRON_SECRET }, async () => {
    const res = await handler.fetch(post({ 'x-cron-secret': 'wrong' }));
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error, 'unauthorized');
  });
});

Deno.test('missing x-cron-secret header returns 401', async () => {
  await withEnv({ CRON_SECRET }, async () => {
    const res = await handler.fetch(post());
    assertEquals(res.status, 401);
  });
});

Deno.test('authenticated but invalid JSON body returns 400', async () => {
  await withEnv({ CRON_SECRET }, async () => {
    const res = await handler.fetch(post({ 'x-cron-secret': CRON_SECRET, 'content-type': 'application/json' }, '{not json'));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'bad_request');
  });
});

Deno.test('authenticated but unknown mode returns 400', async () => {
  await withEnv({ CRON_SECRET }, async () => {
    const res = await handler.fetch(
      post({ 'x-cron-secret': CRON_SECRET, 'content-type': 'application/json' }, JSON.stringify({ mode: 'weekly' })),
    );
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'bad_request');
  });
});

Deno.test('correct secret and valid body but no Supabase env returns 500 (misconfigured), not 401', async () => {
  // Proves the secret matched and the body parsed: we got past auth and
  // validation and failed only when building the service-role client.
  await withEnv(
    { CRON_SECRET, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_SECRET_KEYS: undefined },
    async () => {
      const res = await handler.fetch(
        post(
          { 'x-cron-secret': CRON_SECRET, 'content-type': 'application/json' },
          JSON.stringify({ mode: 'nightly' }),
        ),
      );
      assertEquals(res.status, 500);
      assertEquals((await res.json()).error, 'server_misconfigured');
    },
  );
});

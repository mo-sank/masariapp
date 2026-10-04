import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

import { REDACTED, scrubBreadcrumb, scrubEvent } from './sentry';

// The Sentry SDK is not needed to test the pure scrubbers, but importing
// src/lib/sentry pulls it in; mock it to a no-op so the module loads under Jest.
// jest.mock calls are hoisted above the imports above, so these still apply.
jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));
jest.mock('./config', () => ({ config: { sentryDsn: undefined } }));

describe('scrubEvent (requirement 9.1: emails and ids scrubbed)', () => {
  it('drops the user object entirely', () => {
    const event = {
      user: { id: 'auth0|123', email: 'teen@example.com', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.user).toBeUndefined();
  });

  it('redacts emails embedded in the message', () => {
    const event = { message: 'login failed for teen@example.com' } as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.message).toBe(`login failed for ${REDACTED}`);
  });

  it('redacts emails in exception values', () => {
    const event = {
      exception: {
        values: [{ type: 'Error', value: 'bad address a@b.co and c@d.io' }],
      },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.exception?.values?.[0].value).toBe(`bad address ${REDACTED} and ${REDACTED}`);
  });

  it('redacts id-like keys in extra and emails in extra strings', () => {
    const event = {
      extra: {
        user_id: 'auth0|999',
        sub: 'auth0|999',
        note: 'contact me@x.com',
        count: 3,
      },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.extra?.user_id).toBe(REDACTED);
    expect(scrubbed.extra?.sub).toBe(REDACTED);
    expect(scrubbed.extra?.note).toBe(`contact ${REDACTED}`);
    // Non-string, non-id values are left alone.
    expect(scrubbed.extra?.count).toBe(3);
  });

  it('leaves an event with no PII unchanged', () => {
    const event = { message: 'something broke' } as ErrorEvent;
    expect(scrubEvent(event).message).toBe('something broke');
  });
});

describe('scrubBreadcrumb', () => {
  it('redacts emails and id-like data keys', () => {
    const crumb = {
      message: 'navigated as teen@example.com',
      data: { user_id: 'auth0|1', path: '/learn' },
    } as unknown as Breadcrumb;
    const scrubbed = scrubBreadcrumb(crumb);
    expect(scrubbed.message).toBe(`navigated as ${REDACTED}`);
    expect(scrubbed.data?.user_id).toBe(REDACTED);
    expect(scrubbed.data?.path).toBe('/learn');
  });
});

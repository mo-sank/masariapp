/**
 * Sentry crash reporting (requirement 9.1).
 *
 * Requirement 9.1: "WHEN an unhandled error occurs THEN Sentry SHALL capture it
 * with sendDefaultPii disabled and emails and ids scrubbed."
 *
 * This module centralizes Sentry setup so the privacy posture lives in one
 * place:
 *   - `sendDefaultPii: false` — the SDK does NOT attach IP addresses, cookies,
 *     or user context automatically.
 *   - a `beforeSend` scrubber ({@link scrubEvent}) runs on every outgoing event
 *     and removes any email / user id that still slipped in (from a message, an
 *     exception value, or the `user` object) before the event leaves the device.
 *   - breadcrumbs are scrubbed the same way so a logged line can't carry PII.
 *
 * Sentry is OFF unless a DSN is configured (src/lib/config.ts `sentryDsn`). It
 * stays disabled in local development and tests, where `EXPO_PUBLIC_SENTRY_DSN`
 * is unset, so no events are sent and `initSentry()` is a no-op. The DSN itself
 * is a public client key, not a secret; the sensitive `SENTRY_AUTH_TOKEN` used
 * for source-map upload lives only in the EAS build environment.
 */
import * as Sentry from '@sentry/react-native';

import { config } from './config';

/** Matches email addresses so they can be redacted from free-form strings. */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** The marker left in place of any redacted value. */
export const REDACTED = '[redacted]';

/** Keys on `event.extra` / `contexts` that commonly hold identifiers. */
const ID_LIKE_KEYS = ['id', 'user_id', 'userId', 'sub', 'email'];

/** Replace any email in a string with {@link REDACTED}. */
function scrubString(value: string): string {
  return value.replace(EMAIL_RE, REDACTED);
}

/**
 * Remove emails and user identifiers from a Sentry event before it is sent.
 *
 * Pure and exported so the scrubbing rules are unit tested directly rather than
 * only through the SDK. It:
 *   - drops the `user` object entirely (id, email, ip_address, username),
 *   - redacts emails from the top-level message and from every exception value,
 *   - redacts id-like keys found in `extra`.
 *
 * The event is mutated in place and returned (matching the `beforeSend`
 * contract, which may return the event or `null` to drop it).
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Never report who the user is. With sendDefaultPii:false the SDK already
  // omits ip_address; dropping `user` covers any id/email set elsewhere.
  if (event.user) {
    delete event.user;
  }

  // Message — redact any embedded email.
  if (typeof event.message === 'string') {
    event.message = scrubString(event.message);
  }

  // Exception values often echo input (e.g. "invalid email a@b.com").
  const values = event.exception?.values;
  if (values) {
    for (const entry of values) {
      if (typeof entry.value === 'string') {
        entry.value = scrubString(entry.value);
      }
    }
  }

  // Extra context: redact id-like keys and emails in string values.
  if (event.extra) {
    for (const [key, value] of Object.entries(event.extra)) {
      if (ID_LIKE_KEYS.includes(key)) {
        event.extra[key] = REDACTED;
      } else if (typeof value === 'string') {
        event.extra[key] = scrubString(value);
      }
    }
  }

  return event;
}

/** Scrub a breadcrumb (its message and any string data) the same way. */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = scrubString(breadcrumb.message);
  }
  if (breadcrumb.data) {
    for (const [key, value] of Object.entries(breadcrumb.data)) {
      if (ID_LIKE_KEYS.includes(key)) {
        breadcrumb.data[key] = REDACTED;
      } else if (typeof value === 'string') {
        breadcrumb.data[key] = scrubString(value);
      }
    }
  }
  return breadcrumb;
}

/**
 * Initialize Sentry. Call once as early as possible at app startup (before the
 * provider tree renders). A no-op when no DSN is configured, so development and
 * test builds stay offline.
 */
export function initSentry(): void {
  const dsn = config.sentryDsn;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    // Requirement 9.1: do not attach IP/cookies/user context automatically.
    sendDefaultPii: false,
    // Final privacy pass on every event and breadcrumb before it is sent.
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

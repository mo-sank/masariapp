/**
 * Shared username validation + profanity filter (client side).
 *
 * The user now picks their own username in onboarding (no more generated
 * `adjective-animal-number` names). This module is the client-side source of
 * truth for "is this username acceptable" so the UI can give instant feedback
 * before issuing any network request. It is MIRRORED on the server by
 * `public.username_allowed(text)` (see
 * supabase/migrations/20250107000002_username_rules.sql) and the profiles CHECK;
 * the server is authoritative, this is for UX. Keep the pattern and the
 * blocklist in sync with that migration when editing either.
 *
 * Everything here is pure (no device, network, or React dependency) so it is
 * trivially unit testable.
 */

/**
 * The username format the database enforces (profiles CHECK + the server
 * validator): letters, numbers, underscore and hyphen, 3-20 characters.
 * Exported for tests and the availability hook.
 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

/**
 * A small, reviewed blocklist of obviously unsuitable fragments for a teen
 * audience (profanity, slurs, sexual terms). Matched case-insensitively as
 * substrings, so simple variants embedded in a longer name are still caught.
 * This is a pragmatic filter, not an exhaustive moderation system. Mirror of the
 * list inside `public.username_allowed`; keep the two in sync.
 */
export const USERNAME_BLOCKLIST: readonly string[] = [
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'bastard',
  'dick',
  'piss',
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'whore',
  'slut',
  'rape',
  'nazi',
  'hitler',
  'kkk',
  'pedo',
  'porn',
  'sex',
  'cum',
  'penis',
  'vagina',
  'boob',
  'tits',
  'anus',
  'anal',
] as const;

/** Why a username was rejected. */
export type UsernameRejectReason = 'format' | 'profanity';

/** The result of validating a username. */
export type UsernameValidation = { ok: true } | { ok: false; reason: UsernameRejectReason };

/**
 * Validate a candidate username against the format rules and the blocklist.
 *
 * Returns `{ ok: true }` for an acceptable name, or `{ ok: false, reason }`
 * where `reason` is:
 *   - `'format'`   — wrong length or disallowed characters (fails the pattern),
 *   - `'profanity'`— matches the format but contains a blocked fragment.
 *
 * Pure and synchronous: callers use it for instant feedback before issuing the
 * `is_username_available` RPC, so malformed/profane input never hits the network.
 */
export function validateUsername(name: string): UsernameValidation {
  if (!USERNAME_PATTERN.test(name)) {
    return { ok: false, reason: 'format' };
  }
  const normalized = name.toLowerCase();
  for (const fragment of USERNAME_BLOCKLIST) {
    if (normalized.includes(fragment)) {
      return { ok: false, reason: 'profanity' };
    }
  }
  return { ok: true };
}

/** Convenience predicate: true when the username passes all client-side rules. */
export function isUsernameAllowed(name: string): boolean {
  return validateUsername(name).ok;
}

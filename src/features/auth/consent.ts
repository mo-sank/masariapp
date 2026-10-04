/**
 * Current legal document versions (requirement 5.3).
 *
 * Onboarding records which Terms and Privacy versions the user accepted by
 * passing these strings to `create_profile`, which writes one consent row per
 * document. Bumping a version here is how we mark that the document changed:
 * because consents are append-only and versioned, a future "re-accept the
 * updated terms" flow can compare a user's latest accepted version against
 * these constants.
 *
 * Keep these as the single source of truth for the versions the app presents.
 * The actual document URLs live in Settings (task 11) and are intentionally not
 * coupled to the version strings here.
 */

/** Version of the Terms of Service the app currently presents. */
export const TERMS_VERSION = '2025-01-01';

/** Version of the Privacy Policy the app currently presents. */
export const PRIVACY_VERSION = '2025-01-01';

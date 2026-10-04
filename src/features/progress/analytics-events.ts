/**
 * The analytics event-name allowlist (requirement 9.4).
 *
 * This is the single source of truth for the set of permitted analytics event
 * names. `src/lib/analytics.ts` rejects any `track()` call whose name is not in
 * this list before it ever reaches the queue, and the `log_events` RPC enforces
 * the EXACT SAME list server-side (see the log_events migration under
 * supabase/migrations) so a stale or tampered client cannot write an unknown
 * name. The two lists MUST be kept in sync: when a later spec needs a new event,
 * add it here AND in the RPC's allowlist in the same change.
 *
 * The foundation spec ships the two events it emits itself:
 *   - `session_start`: logged once when the app starts / a session begins.
 *   - `onboarding_completed`: logged when create_profile succeeds in onboarding.
 *
 * The lesson-engine spec (requirement 10.1) adds the lesson lifecycle events:
 *   - `lesson_started`: logged when a lesson session begins in the player.
 *   - `step_answered`: logged when a scored step is answered (with correctness).
 *   - `lesson_completed`: logged when a lesson run finishes (with duration).
 *   - `rewind_session_completed`: logged when a Rewind session finishes.
 *
 * Later specs (trading, progression) append their own names to both places.
 * Keeping the canonical list in the progress feature matches the spec's
 * requirement text and keeps all analytics vocabulary in one module.
 *
 * Privacy note (requirement 9.4): event NAMES are a fixed, reviewed vocabulary;
 * they never carry user content. The separate props-key denylist in
 * src/lib/analytics.ts stops free text / emails / tokens from being attached.
 */

/**
 * The permitted analytics event names. `as const` makes each entry a literal so
 * {@link AnalyticsEventName} is a precise string-literal union, not just
 * `string`.
 */
export const ANALYTICS_EVENT_NAMES = [
  // foundation-auth-data
  'session_start',
  'onboarding_completed',
  // lesson-engine (requirement 10.1)
  'lesson_started',
  'step_answered',
  'lesson_completed',
  'rewind_session_completed',
] as const;

/** The union of every allowed event name. */
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

/**
 * A fast membership set for the allowlist. Built once from
 * {@link ANALYTICS_EVENT_NAMES} so callers never duplicate the list.
 */
const ALLOWED = new Set<string>(ANALYTICS_EVENT_NAMES);

/**
 * Narrowing guard: true when `name` is one of the allowed event names. Used by
 * the analytics queue to drop unknown names before they are queued.
 */
export function isAllowedEventName(name: string): name is AnalyticsEventName {
  return ALLOWED.has(name);
}

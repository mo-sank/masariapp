/**
 * Device IANA timezone lookup (requirement 5.3).
 *
 * `create_profile` records the user's timezone so later features (streaks,
 * market hours) can reason about the user's local day. React Native's Hermes
 * engine ships Intl, so `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * returns the device IANA zone (e.g. "America/New_York") without any extra
 * dependency. We guard it defensively: if Intl is unavailable or returns an
 * empty value, we fall back to the same default the database uses, and the RPC
 * applies that default too for an empty string.
 */

/** The default timezone used when the device zone cannot be determined. */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Best-effort device IANA timezone, or {@link DEFAULT_TIMEZONE} if it cannot be
 * resolved. Never throws.
 */
export function getDeviceTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.length > 0 ? zone : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

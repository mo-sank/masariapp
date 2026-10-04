/**
 * Human-readable names for unlockable feature keys (requirement 2.3).
 *
 * A lesson's `unlocks[]` carries feature *keys* (e.g. `explore`), but the path's
 * unlock previews show the learner a readable name (e.g. "Explore"). This map is
 * the single place that translation lives so every node labels an unlock the
 * same way. Keys that are not in the map fall back to a title-cased version of
 * the key, so a newly authored unlock still renders something sensible rather
 * than a raw identifier.
 *
 * Pure data — no React or network — so it is usable from components and tests
 * alike.
 */

/** Known feature keys mapped to the names shown to learners. */
const FEATURE_LABELS: Record<string, string> = {
  explore: 'Explore',
  portfolio: 'Portfolio',
  learn: 'Learn',
  trade: 'Trading',
};

/** Title-case a bare feature key as a last-resort label (e.g. `my_tool` -> "My Tool"). */
function titleCase(key: string): string {
  return key
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** The learner-facing name for a feature key, or a title-cased fallback. */
export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? titleCase(key);
}

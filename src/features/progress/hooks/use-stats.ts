/**
 * Learner stats query — progress feature entry point (requirements 3.1, 3.4).
 *
 * The design lists `useStats()` among the progress feature's hooks (design
 * "Components"). The lessons feature already owns the single `user_stats` query
 * keyed `['stats']` — the same key the completion flow invalidates so XP and the
 * streak refresh live (requirement 3.4). Re-exporting it here (rather than
 * declaring a second query) keeps one cached fetch and one invalidation point
 * while giving the progress feature its documented hook: `StatsHeader`'s data
 * comes from `src/features/progress`, not by reaching into lessons.
 *
 * The row carries everything the StatsHeader shows (requirement 3.1): XP total,
 * current streak, longest streak, and Streak Freezes.
 */
export { useStats, fetchStats, STATS_QUERY_KEY } from '../../lessons/hooks/use-stats';

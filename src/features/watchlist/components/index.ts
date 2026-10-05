/**
 * Watchlist components barrel.
 *
 * One import point for the watchlist's presentational pieces so screens (the
 * stock detail page, later a Watchlist section) can pull what they need without
 * reaching into individual files.
 */
export {
  WatchlistButton,
  WATCHLIST_FEATURE_KEY,
  WATCHLIST_UNLOCK_LESSON_ID,
  type WatchlistButtonProps,
} from './watchlist-button';

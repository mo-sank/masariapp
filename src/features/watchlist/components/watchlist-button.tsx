/**
 * WatchlistButton (requirements 6.1, 6.2, 6.3).
 *
 * The add/remove toggle a learner taps on the stock detail page (and reusable
 * on other price rows). It joins three pieces of state for one symbol:
 *
 *  - the caller's watchlist (`useWatchlist`) to show "Add to watchlist" vs
 *    "Following ✓" and to toggle the right RPC (requirement 6.1),
 *  - the `watchlist` feature unlock (`useUnlocks`): while locked the control is
 *    replaced by a lock hint naming the unlocking lesson instead of an active
 *    button (requirement 6.3). We fail closed — while unlocks load or error the
 *    button stays locked so it never flashes active,
 *  - the add/remove mutations: a successful add shows confirmation feedback; a
 *    `watchlist_full` add shows the friendly limit message (requirement 6.2).
 *
 * The feature key and unlocking lesson are confirmed against the seed catalog
 * (supabase/seed/catalog.generated.sql: `watchlist` is granted by lesson L1.2)
 * and the bundled lesson content ("The Auction Room").
 *
 * This component only renders and dispatches; the limit/lock rules themselves
 * live in the RPC (server-authoritative, same as the rest of trading).
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text, useToast } from '../../../components/ui';
import { getLesson } from '../../lessons/content';
import { useUnlocks } from '../../lessons/hooks/use-unlocks';
import { useTheme } from '../../../theme/theme-provider';
import { useWatchlist } from '../use-watchlist';
import {
  mapWatchlistError,
  useWatchlistAdd,
  useWatchlistRemove,
} from '../use-watchlist-mutations';

/** Feature key gating the watchlist, and the lesson that grants it (L1.2). */
export const WATCHLIST_FEATURE_KEY = 'watchlist';
export const WATCHLIST_UNLOCK_LESSON_ID = 'L1.2';
/** Fallback title if the lesson content is unavailable. */
const WATCHLIST_LESSON_FALLBACK_TITLE = 'The Auction Room';

export interface WatchlistButtonProps {
  /** The company symbol this button follows/unfollows. */
  symbol: string;
  /** Whether a user is signed in; gates the unlock + watchlist queries. */
  isSignedIn: boolean;
}

export function WatchlistButton({ symbol, isSignedIn }: WatchlistButtonProps) {
  const toast = useToast();
  const unlocks = useUnlocks(isSignedIn);
  const watchlist = useWatchlist(isSignedIn);
  const add = useWatchlistAdd();
  const remove = useWatchlistRemove();

  const unlockedKeys = useMemo(
    () => new Set((unlocks.data ?? []).map((u) => u.feature_key)),
    [unlocks.data],
  );
  // Fail closed: locked while unlocks are loading or errored (requirement 6.3).
  const unlocked = unlockedKeys.has(WATCHLIST_FEATURE_KEY);

  if (!unlocked) {
    return <WatchlistLockHint />;
  }

  const isFollowing = (watchlist.data ?? []).some((row) => row.symbol === symbol);
  const pending = add.isPending || remove.isPending;

  const onPress = () => {
    if (isFollowing) {
      remove.mutate(symbol, {
        onSuccess: () => toast.show(`Removed ${symbol} from your watchlist`),
        onError: (error) => toast.show(mapWatchlistError(error), { tone: 'error' }),
      });
      return;
    }
    add.mutate(symbol, {
      // Requirement 6.1: feedback on a successful add.
      onSuccess: () => toast.show(`Added ${symbol} to your watchlist`),
      // Requirement 6.2: watchlist_full → friendly limit message (and any other
      // server error maps to friendly copy too).
      onError: (error) => toast.show(mapWatchlistError(error), { tone: 'error' }),
    });
  };

  return (
    <Button
      title={isFollowing ? 'Following ✓' : 'Add to watchlist'}
      variant={isFollowing ? 'secondary' : 'primary'}
      onPress={onPress}
      loading={pending}
      accessibilityLabel={
        isFollowing ? `Remove ${symbol} from your watchlist` : `Add ${symbol} to your watchlist`
      }
    />
  );
}

/** The lock hint shown in place of the button while watchlist is locked (6.3). */
function WatchlistLockHint() {
  const theme = useTheme();
  const lessonTitle = getLesson(WATCHLIST_UNLOCK_LESSON_ID)?.title ?? WATCHLIST_LESSON_FALLBACK_TITLE;
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.hint,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <Text variant="caption" color="textMuted">
        {`🔒 Complete "${lessonTitle}" to follow companies on your watchlist.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    borderWidth: 1,
  },
});

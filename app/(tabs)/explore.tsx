import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { Disclaimer, LockedState, Screen, StateView, Text } from '../../src/components/ui';
import {
  DelayedBadge,
  InstrumentRow,
  MarketBanner,
} from '../../src/features/explore/components';
import { useExploreList, type ExploreListItem } from '../../src/features/explore/use-explore-list';
import { getLesson } from '../../src/features/lessons/content';
import { useUnlocks } from '../../src/features/lessons/hooks/use-unlocks';
import { useMarketStatus } from '../../src/features/trading/use-market-status';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Explore tab (requirements 4.1, 4.2, 4.3, 4.4, 11.1, 11.2).
 *
 * Browse and search the instrument universe. The tab is gated on the `explore`
 * feature: until the learner completes the lesson that grants it ("Slice the
 * Pizza", L1.1), the tab shows a {@link LockedState} naming that lesson
 * (requirement 4.3) rather than a dead end. Fail closed — while unlocks are
 * loading or errored we treat explore as locked so content never flashes before
 * the gate resolves.
 *
 * Unlocked, it renders:
 *  - a {@link MarketBanner} (Open / Closed after hours / Closed holiday) at the
 *    top of this price screen (requirement 11.1);
 *  - a {@link DelayedBadge} that labels prices "Delayed ~15 min" while open and
 *    "Last close" while closed (requirements 4.4, 11.2);
 *  - a search box that filters by symbol or name (requirement 4.3); and
 *  - the instrument list with starters surfaced first and each row showing name,
 *    symbol, price, and day change (requirements 4.1, 4.2), routing to the stock
 *    detail page on tap.
 *
 * Data joining/filtering lives in {@link useExploreList}; this screen owns only
 * the gate, the search input, navigation, and the loading/empty/error states.
 */

/** The feature key this tab is gated on (steering: explore -> L1.1). */
const EXPLORE_FEATURE_KEY = 'explore';
/** The lesson that unlocks explore, resolved from the bundled catalog. */
const EXPLORE_UNLOCK_LESSON_ID = 'L1.1';

export default function ExploreScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const unlocks = useUnlocks(isSignedIn);

  const isUnlocked = useMemo(
    () => (unlocks.data ?? []).some((u) => u.feature_key === EXPLORE_FEATURE_KEY),
    [unlocks.data],
  );

  // Gate: while loading or on error, fail closed (treat as locked).
  if (!isUnlocked) {
    const lessonTitle = getLesson(EXPLORE_UNLOCK_LESSON_ID)?.title ?? 'Slice the Pizza';
    return (
      <Screen center>
        <LockedState
          featureName="Explore"
          unlockedByLesson={lessonTitle}
          actionLabel="Go to Learn"
          onAction={() => router.push('/(tabs)/learn')}
        />
      </Screen>
    );
  }

  return <ExploreList theme={theme} />;
}

/** The unlocked browse UI, split out so hooks run only once the gate passes. */
function ExploreList({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const [search, setSearch] = useState('');
  const { isLoading, isError, refetch, items } = useExploreList(search);
  const market = useMarketStatus();
  const marketOpen = market.data?.isOpen ?? true;

  const openStock = (symbol: string) => {
    // Symbols are plain tickers, but route through the param form for safety.
    router.push({ pathname: '/stock/[symbol]', params: { symbol } });
  };

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Explore
      </Text>

      <MarketBanner status={market.data?.status} holidayName={market.data?.holidayName} />

      <DelayedBadge session={market.data?.session} marketOpen={marketOpen} />

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by symbol or name"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Search instruments"
        style={[
          styles.search,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.md,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
      />
    </View>
  );

  // First load: show the loading state (keeps the gate's instant render snappy).
  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load the market list. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.instrument.symbol}
        renderItem={({ item }: { item: ExploreListItem }) => (
          <InstrumentRow item={item} onPress={openStock} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <StateView
            kind="empty"
            title="No matches"
            message={
              search.trim()
                ? `Nothing matches "${search.trim()}". Try another symbol or name.`
                : 'No instruments to show yet.'
            }
          />
        }
        ListFooterComponent={<Disclaimer style={{ marginTop: theme.spacing.md }} />}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    minHeight: 44,
  },
});

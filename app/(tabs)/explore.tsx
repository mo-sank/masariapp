import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Disclaimer, Screen, StateView, Text } from '../../src/components/ui';
import {
  DelayedBadge,
  InstrumentRow,
  MarketBanner,
} from '../../src/features/explore/components';
import { useExploreList, type ExploreListItem } from '../../src/features/explore/use-explore-list';
import {
  matchesYouthCategory,
  YOUTH_CATEGORIES,
  type YouthCategoryKey,
} from '../../src/features/explore/youth-tags';
import { Gate } from '../../src/features/progress/components/Gate';
import { useMarketStatus } from '../../src/features/trading/use-market-status';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Explore tab (requirements 4.1, 4.2, 4.3, 4.4, 11.1, 11.2).
 *
 * Browse and search the instrument universe. The tab is gated on the `explore`
 * feature: until the learner completes the lesson that grants it ("Slice the
 * Pizza", L1.1), the tab shows a locked state naming that lesson (requirement
 * 4.3) rather than a dead end.
 *
 * Unlocked, it renders:
 *  - a {@link MarketBanner} (Open / Closed after hours / Closed holiday) at the
 *    top of this price screen (requirement 11.1);
 *  - a {@link DelayedBadge} that labels prices "Delayed ~15 min" while open and
 *    "Last close" while closed (requirements 4.4, 11.2);
 *  - youth category filter chips (Gaming, Streetwear, Streaming, Food);
 *  - a search box that filters by symbol or name (requirement 4.3); and
 *  - the instrument list with starters surfaced first and each row showing name,
 *    symbol, price, and day change (requirements 4.1, 4.2), routing to the stock
 *    detail page on tap.
 */

export default function ExploreScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();

  return (
    <Gate feature="explore" isSignedIn={isSignedIn} loadingFallback={<ExploreLoading />}>
      <ExploreList theme={theme} />
    </Gate>
  );
}

/** Full-screen loading placeholder shown while the unlock check resolves. */
function ExploreLoading() {
  return (
    <Screen>
      <StateView kind="loading" />
    </Screen>
  );
}

/** The unlocked browse UI, split out so hooks run only once the gate passes. */
function ExploreList({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<YouthCategoryKey>('all');
  const { isLoading, isError, refetch, items } = useExploreList(search);
  const market = useMarketStatus();
  const marketOpen = market.data?.isOpen ?? true;

  const filteredItems = useMemo(
    () => items.filter((item) => matchesYouthCategory(item.instrument.symbol, selectedCategory)),
    [items, selectedCategory],
  );

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

      {/* Relatable Youth Category Filters (Phase 2) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2 }}
        accessibilityRole="tablist"
      >
        {YOUTH_CATEGORIES.map((cat) => {
          const selected = selectedCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              accessibilityRole="tab"
              accessibilityLabel={`Category ${cat.label}`}
              accessibilityState={{ selected }}
              onPress={() => setSelectedCategory(cat.key)}
              style={[
                styles.categoryPill,
                {
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                  borderColor: selected ? theme.colors.primaryDark : theme.colors.border,
                  borderRadius: theme.radii.pill,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.xs + 3,
                },
              ]}
            >
              <Text
                variant="caption"
                style={{
                  color: selected ? theme.colors.onPrimary : theme.colors.text,
                  fontWeight: '700',
                }}
              >
                {cat.emoji} {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
        data={filteredItems}
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
              search.trim() || selectedCategory !== 'all'
                ? 'No matching stocks found in this category. Try another filter.'
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
    borderWidth: 1.5,
    borderBottomWidth: 3,
    minHeight: 48,
  },
  categoryPill: {
    borderWidth: 1.5,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

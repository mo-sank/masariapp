/**
 * Financial Glossary Screen (`/glossary`).
 *
 * Dedicated screen allowing users to browse, search, and learn all foundational
 * financial terms, plain-language definitions, and real-world teen analogies.
 */

import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Screen, Text } from '../src/components/ui';
import { listGlossaryTerms } from '../src/features/glossary/glossary-data';
import { useTheme } from '../src/theme/theme-provider';

type CategoryFilter = 'all' | 'basics' | 'trading' | 'metrics' | 'portfolio';

const CATEGORIES: { key: CategoryFilter; label: string; emoji: string }[] = [
  { key: 'all', label: 'All', emoji: '📚' },
  { key: 'basics', label: 'Basics', emoji: '🌱' },
  { key: 'trading', label: 'Trading', emoji: '⚡' },
  { key: 'metrics', label: 'Metrics', emoji: '📊' },
  { key: 'portfolio', label: 'Portfolio', emoji: '💼' },
];

export default function GlossaryScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allTerms = useMemo(() => listGlossaryTerms(), []);

  const filteredTerms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTerms.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      const matchesQuery =
        !q ||
        item.term.toLowerCase().includes(q) ||
        item.simpleDefinition.toLowerCase().includes(q) ||
        item.everydayAnalogy.toLowerCase().includes(q) ||
        item.example.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [allTerms, search, selectedCategory]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/learn');
    }
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.md }}>
      {/* Navigation Header */}
      <View style={styles.topBar}>
        <Button
          title="← Back"
          variant="secondary"
          onPress={handleBack}
          accessibilityLabel="Back from Glossary"
        />
        <View style={styles.headerTitles}>
          <Text variant="title" accessibilityRole="header">
            📖 Financial Glossary
          </Text>
          <Text variant="caption" color="textMuted">
            Plain-English definitions & everyday analogies
          </Text>
        </View>
      </View>

      {/* Category Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.categoryList, { gap: theme.spacing.xs }]}
      >
        {CATEGORIES.map((cat) => {
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
                  paddingVertical: theme.spacing.xs + 2,
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

      {/* Search Input */}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search terms, analogies, keywords..."
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search glossary terms"
        style={[
          styles.searchInput,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          },
        ]}
      />

      {/* Term Count */}
      <Text variant="caption" color="textMuted" style={{ fontWeight: '600' }}>
        Showing {filteredTerms.length} of {allTerms.length} terms
      </Text>

      {/* Terms List */}
      {filteredTerms.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text variant="body" color="textMuted" style={{ textAlign: 'center' }}>
            {`No financial terms match "${search}".`}
          </Text>
          <Button
            title="Clear Search"
            variant="secondary"
            onPress={() => setSearch('')}
          />
        </Card>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {filteredTerms.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <Card key={entry.id} style={{ gap: theme.spacing.xs }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.term} glossary card`}
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={styles.cardHeader}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" color="primary" style={styles.categoryBadge}>
                      {entry.category.toUpperCase()}
                    </Text>
                    <Text variant="title" style={{ fontSize: 18 }}>
                      {entry.term}
                    </Text>
                  </View>
                  <Text variant="caption" color="textMuted" style={{ fontWeight: '700' }}>
                    {isExpanded ? '▲' : '▼'}
                  </Text>
                </Pressable>

                <Text variant="body" color="text" style={{ marginTop: 2 }}>
                  {entry.simpleDefinition}
                </Text>

                {isExpanded && (
                  <View style={[styles.expandedArea, { gap: theme.spacing.sm }]}>
                    <View
                      style={[
                        styles.analogyBox,
                        {
                          backgroundColor: theme.colors.background,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radii.sm,
                          padding: theme.spacing.sm,
                        },
                      ]}
                    >
                      <Text variant="caption" color="textMuted" style={{ fontWeight: '700' }}>
                        💡 EVERYDAY ANALOGY
                      </Text>
                      <Text variant="caption" color="text" style={{ fontStyle: 'italic', marginTop: 2 }}>
                        {entry.everydayAnalogy}
                      </Text>
                    </View>

                    <View style={{ gap: 2 }}>
                      <Text variant="caption" color="textMuted" style={{ fontWeight: '700' }}>
                        📌 REAL-WORLD EXAMPLE
                      </Text>
                      <Text variant="caption" color="text">
                        {entry.example}
                      </Text>
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    gap: 8,
  },
  headerTitles: {
    gap: 2,
    marginTop: 4,
  },
  categoryList: {
    paddingVertical: 2,
  },
  categoryPill: {
    borderWidth: 1.5,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    borderWidth: 1,
    fontSize: 15,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  expandedArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 4,
  },
  analogyBox: {
    borderWidth: 1,
  },
});

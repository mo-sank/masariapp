/**
 * KnowledgeBinder component (Phase 2 - Item 2.3: Persistent Summary Sheets).
 *
 * Renders a "Knowledge Binder" where users can browse and review key takeaways
 * and teen analogies for every lesson anytime from their Profile tab.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { listTakeaways, type LessonTakeaway } from '../takeaways';

export interface KnowledgeBinderProps {
  takeaways?: LessonTakeaway[];
  onOpenGlossary?: () => void;
}

export function KnowledgeBinder({
  takeaways = listTakeaways(),
  onOpenGlossary,
}: KnowledgeBinderProps) {
  const theme = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(takeaways[0]?.lessonId ?? null);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="title" accessibilityRole="header">
          📚 Knowledge Binder
        </Text>
        <Text variant="caption" color="textMuted">
          {takeaways.length} Key Concept{takeaways.length === 1 ? '' : 's'}
        </Text>
      </View>

      <Text variant="body" color="textMuted">
        Review core investing concepts and real-world analogies anytime.
      </Text>

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
        {takeaways.map((item) => {
          const isExpanded = expandedId === item.lessonId;
          return (
            <Card key={item.lessonId} style={{ gap: theme.spacing.xs }}>
              <Pressable
                testID={`takeaway-${item.lessonId}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.title} takeaway card`}
                accessibilityState={{ expanded: isExpanded }}
                onPress={() =>
                  setExpandedId((prev) => (prev === item.lessonId ? null : item.lessonId))
                }
                style={styles.cardHeader}
              >
                <View style={styles.titleRow}>
                  <Text variant="title" style={{ fontSize: 20 }}>
                    {item.emoji}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>
                      UNIT {item.unit} · {item.lessonId}
                    </Text>
                    <Text variant="body" style={{ fontWeight: '700' }}>
                      {item.title}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" color="textMuted" style={{ fontWeight: '700' }}>
                  {isExpanded ? '▲' : '▼'}
                </Text>
              </Pressable>

              <Text variant="caption" color="text" style={{ fontWeight: '600', marginTop: 2 }}>
                {item.tagline}
              </Text>

              {isExpanded && (
                <View style={[styles.expandedContent, { gap: theme.spacing.sm, marginTop: theme.spacing.xs }]}>
                  <View style={{ gap: 4 }}>
                    {item.bullets.map((bullet, idx) => (
                      <Text key={idx} variant="caption" color="text">
                        • {bullet}
                      </Text>
                    ))}
                  </View>

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
                      💡 REAL-WORLD ANALOGY
                    </Text>
                    <Text variant="caption" color="text" style={{ fontStyle: 'italic', marginTop: 2 }}>
                      {item.teenAnalogy}
                    </Text>
                  </View>
                </View>
              )}
            </Card>
          );
        })}
      </View>

      {onOpenGlossary ? (
        <Button
          title="📖 Open Financial Glossary"
          variant="secondary"
          onPress={onOpenGlossary}
          accessibilityLabel="Open Financial Glossary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  analogyBox: {
    borderWidth: 1,
  },
});

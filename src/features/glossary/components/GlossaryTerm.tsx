/**
 * GlossaryTerm (Phase 2 - Zero-Knowledge Onboarding).
 *
 * An inline tappable text element with a subtle dotted underline and an info badge.
 * Tapping it pops up the full plain-English definition & analogy modal.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlossaryModal } from './GlossaryModal';
import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { getGlossaryTerm } from '../glossary-data';

export interface GlossaryTermProps {
  /** The glossary entry id (e.g. 'stock', 'market_cap', 'dividend'). */
  termId: string;
  /** Optional display text override (defaults to term name). */
  displayText?: string;
}

export function GlossaryTerm({ termId, displayText }: GlossaryTermProps) {
  const theme = useTheme();
  const entry = getGlossaryTerm(termId);
  const [modalVisible, setModalVisible] = useState(false);

  if (!entry) {
    return <Text variant="body">{displayText ?? termId}</Text>;
  }

  const label = displayText ?? entry.term;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. Tap to learn what this means.`}
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.container,
          {
            borderBottomColor: theme.colors.primary,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text variant="body" color="primary" style={styles.termText}>
          {label}
        </Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="caption" color="textMuted" style={styles.badgeText}>
            ⓘ
          </Text>
        </View>
      </Pressable>

      <GlossaryModal
        entry={entry}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
    gap: 4,
  },
  termText: {
    fontWeight: '600',
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
});

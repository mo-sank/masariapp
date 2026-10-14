/**
 * GlossaryModal (Phase 2 - Zero-Knowledge Onboarding).
 *
 * An accessible modal sheet that presents a financial term in plain language
 * with an everyday analogy and practical example for young learners.
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { GlossaryEntry } from '../glossary-data';

export interface GlossaryModalProps {
  entry: GlossaryEntry | null;
  visible: boolean;
  onClose: () => void;
}

export function GlossaryModal({ entry, visible, onClose }: GlossaryModalProps) {
  const theme = useTheme();

  if (!entry) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close glossary dialog">
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text variant="caption" color="primary" style={styles.categoryBadge}>
                {entry.category.toUpperCase()} · GLOSSARY
              </Text>
              <Text variant="title" accessibilityRole="header">
                {entry.term}
              </Text>
            </View>
          </View>

          {/* Plain English Definition */}
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="textMuted" style={styles.sectionHeading}>
              WHAT IT MEANS
            </Text>
            <Text variant="body" color="text">
              {entry.simpleDefinition}
            </Text>
          </View>

          {/* Everyday Analogy Card */}
          <Card
            style={[
              styles.analogyCard,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.primary,
                borderLeftWidth: 4,
                gap: theme.spacing.xs,
              },
            ]}
          >
            <Text variant="caption" color="primary" style={styles.sectionHeading}>
              💡 THE EVERYDAY ANALOGY
            </Text>
            <Text variant="body" color="text">
              {entry.everydayAnalogy}
            </Text>
          </Card>

          {/* Real-World Example */}
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="textMuted" style={styles.sectionHeading}>
              REAL-WORLD EXAMPLE
            </Text>
            <Text variant="caption" color="textMuted">
              {entry.example}
            </Text>
          </View>

          {/* Close Action */}
          <Button
            title="Got it!"
            variant="primary"
            onPress={onClose}
            accessibilityLabel="Close definition"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryBadge: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionHeading: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  analogyCard: {
    width: '100%',
  },
});

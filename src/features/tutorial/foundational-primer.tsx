/**
 * FoundationalPrimer (Phase 2 - Requirement: Zero-Knowledge Onboarding Layer).
 *
 * A 3-slide swipeable visual micro-story designed for true beginners before
 * starting lessons or diagnostics. Explains what a company is, why shares exist,
 * and what owning stock actually means using relatable teen analogies.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '../../components/ui';
import { useTheme } from '../../theme/theme-provider';

export interface PrimerSlide {
  emoji: string;
  badge: string;
  title: string;
  body: string;
  takeaway: string;
}

export const PRIMER_SLIDES: PrimerSlide[] = [
  {
    emoji: '👟',
    badge: 'STEP 1 OF 3',
    title: 'What is a Company?',
    body: 'Imagine your friend starts a sneaker cleaning business. At first, it is just them, a brush, and some soap. They clean 5 pairs a week and make $50. That small business is a company.',
    takeaway: 'Every giant stock on Wall Street (Apple, Nike, Roblox) started just like that.',
  },
  {
    emoji: '🍕',
    badge: 'STEP 2 OF 3',
    title: 'Why do Companies Sell Shares?',
    body: 'Your friend has 100 customers waiting, but needs $500 to buy high-speed cleaning machines. They don’t have $500, so they divide their business into 100 slices (shares) worth $5 each and sell 40 slices to raise cash.',
    takeaway: 'Companies sell shares to raise money to build bigger, better things.',
  },
  {
    emoji: '📈',
    badge: 'STEP 3 OF 3',
    title: 'What Does Owning 1 Share Mean?',
    body: 'If you buy 1 slice for $5, you legally own 1% of the business! When the company earns profits or becomes famous across the country, your $5 slice might become worth $20 or $50.',
    takeaway: 'Owning a stock is not a lottery ticket — you are an actual owner of a real business.',
  },
];

export interface FoundationalPrimerProps {
  visible: boolean;
  onClose: () => void;
}

export function FoundationalPrimer({ visible, onClose }: FoundationalPrimerProps) {
  const theme = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!visible) return null;

  const slide = PRIMER_SLIDES[currentSlide];
  const isLast = currentSlide >= PRIMER_SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      setCurrentSlide(0);
      onClose();
    } else {
      setCurrentSlide((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((i) => i - 1);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            },
          ]}
        >
          {/* Header & Step Indicator */}
          <View style={styles.topRow}>
            <Text variant="caption" color="primary" style={styles.badge}>
              {slide.badge} · HOW THE MARKET WORKS
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Skip primer"
              style={styles.skipButton}
            >
              <Text variant="caption" color="textMuted">
                Skip
              </Text>
            </Pressable>
          </View>

          {/* Emoji Mascot / Hero */}
          <View style={styles.heroBox}>
            <Text style={styles.heroEmoji} accessibilityElementsHidden importantForAccessibility="no">
              {slide.emoji}
            </Text>
            <Text variant="title" accessibilityRole="header" style={styles.title}>
              {slide.title}
            </Text>
          </View>

          {/* Main Explanation Body */}
          <Text variant="body" color="text" style={styles.bodyText}>
            {slide.body}
          </Text>

          {/* Key Takeaway Card */}
          <Card
            style={[
              styles.takeawayCard,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.primary,
                borderLeftWidth: 4,
                gap: theme.spacing.xs,
              },
            ]}
          >
            <Text variant="caption" color="primary" style={styles.takeawayLabel}>
              KEY TAKEAWAY
            </Text>
            <Text variant="body" color="text">
              {slide.takeaway}
            </Text>
          </Card>

          {/* Navigation Controls */}
          <View style={[styles.controls, { gap: theme.spacing.sm }]}>
            {currentSlide > 0 ? (
              <Button
                title="Previous"
                variant="secondary"
                onPress={handlePrev}
                accessibilityLabel="Previous slide"
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Button
                title={isLast ? "Let's Go!" : 'Next →'}
                variant="primary"
                onPress={handleNext}
                accessibilityLabel={isLast ? 'Complete intro' : 'Next slide'}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 2,
    borderBottomWidth: 5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  skipButton: {
    padding: 4,
  },
  heroBox: {
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  heroEmoji: {
    fontSize: 48,
    lineHeight: 56,
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
  },
  bodyText: {
    lineHeight: 22,
  },
  takeawayCard: {
    width: '100%',
  },
  takeawayLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
});

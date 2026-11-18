/**
 * InfoTip (NFR-5).
 *
 * A small "?" affordance that opens a plain-language explanation of a piece of
 * financial jargon (concentration, sector exposure, basis points, …). Stress
 * Lab copy is for teenagers, so every term that might be unfamiliar gets one of
 * these rather than assuming prior knowledge.
 *
 * It renders a tappable info glyph; tapping opens a lightweight themed popover
 * (a Modal with a dismiss-on-backdrop card) holding the title and explanation.
 * The glyph exposes an accessibility label and hint so the explanation is
 * reachable without sight of the popover.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Button, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface InfoTipProps {
  /** What the tip explains, used as the glyph's accessibility label and title. */
  label: string;
  /** The plain-language explanation. */
  text: string;
}

export function InfoTip({ label, text }: InfoTipProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens a short explanation"
        hitSlop={8}
        style={[
          styles.glyph,
          {
            borderColor: theme.colors.border,
            borderRadius: theme.radii.pill,
          },
        ]}
      >
        <Text variant="caption" color="textMuted" style={styles.glyphText}>
          ?
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[styles.backdrop, { padding: theme.spacing.lg }]}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close explanation"
        >
          {/* Stop the inner card from dismissing when tapped. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.lg,
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
              },
            ]}
          >
            <Text variant="body" color="text" style={styles.title} accessibilityRole="header">
              {label}
            </Text>
            <Text variant="body" color="textMuted">
              {text}
            </Text>
            <Button title="Got it" variant="secondary" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  glyph: {
    width: 20,
    height: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: {
    fontWeight: '700',
    lineHeight: 18,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
  },
  title: {
    fontWeight: '700',
  },
});

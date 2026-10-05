/**
 * PriceChange (requirements 4.1, 5.1).
 *
 * Renders a signed day change in dollars and percent — e.g. "+$1.23 (+0.98%)" —
 * tinted green for a gain, red for a loss, and muted when flat or unknown. The
 * change is computed from integer cents against the previous close so the
 * arithmetic stays exact (see lib/money). When no previous close is available
 * the component shows a muted dash rather than a misleading zero.
 *
 * Colors come from theme tokens (primary for gains reuses the brand green;
 * danger for losses). The sign is also encoded in the text itself, so meaning
 * does not rely on color alone (accessibility).
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { formatPercent, formatSignedCents, pctChange } from '../../../lib/money';

export interface PriceChangeProps {
  /** Current price in integer cents. */
  priceCents: number;
  /** Previous close in integer cents, or null/undefined when unknown. */
  prevCloseCents?: number | null;
  /** Typography variant for the figures. Defaults to `body`. */
  variant?: 'body' | 'caption';
}

/** The pieces a caller may want for its own layout/announcement. */
export interface DayChange {
  deltaCents: number;
  basisPoints: number | null;
  /** -1 loss, 0 flat/unknown, 1 gain. */
  direction: -1 | 0 | 1;
  text: string;
}

/** Compute the signed day change from a price and its previous close. */
export function computeDayChange(priceCents: number, prevCloseCents?: number | null): DayChange {
  if (prevCloseCents == null) {
    return { deltaCents: 0, basisPoints: null, direction: 0, text: '—' };
  }
  const deltaCents = priceCents - prevCloseCents;
  const basisPoints = pctChange(priceCents, prevCloseCents);
  const direction = deltaCents > 0 ? 1 : deltaCents < 0 ? -1 : 0;
  const text = `${formatSignedCents(deltaCents)} (${formatPercent(basisPoints)})`;
  return { deltaCents, basisPoints, direction, text };
}

export function PriceChange({ priceCents, prevCloseCents, variant = 'body' }: PriceChangeProps) {
  const change = computeDayChange(priceCents, prevCloseCents);

  const color =
    change.direction === 1 ? 'primary' : change.direction === -1 ? 'danger' : 'textMuted';

  return (
    <View style={styles.row}>
      <Text variant={variant} color={color} accessibilityLabel={`Day change ${change.text}`}>
        {change.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

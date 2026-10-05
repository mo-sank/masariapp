/**
 * PortfolioSummary (requirement 7.1, 7.4).
 *
 * The header card on the Portfolio tab: total equity (cash + positions value)
 * as the headline figure, the total gain/loss versus starting cash in dollars
 * and percent beneath it, and a cash line. Every figure is formatted from the
 * integer-cents fields of {@link Portfolio} via lib/money — no float math on a
 * money value.
 *
 * The portfolio is paper money, so the card carries a "Paper money" tag
 * (requirement 7.4); the full not-advice disclaimer is rendered once at the
 * bottom of the screen rather than repeated here. Gain/loss is tinted green/red
 * and the sign is carried in the text (accessibility). Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { Portfolio } from '../use-portfolio';

export interface PortfolioSummaryProps {
  portfolio: Portfolio;
}

export function PortfolioSummary({ portfolio }: PortfolioSummaryProps) {
  const theme = useTheme();
  const { equityCents, cashCents, totalGainCents, totalGainBasisPoints } = portfolio;

  const gainText = `${formatSignedCents(totalGainCents)} (${formatPercent(totalGainBasisPoints)})`;
  const gainColor = totalGainCents > 0 ? 'primary' : totalGainCents < 0 ? 'danger' : 'textMuted';

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.tagRow}>
        <View
          style={[
            styles.tag,
            {
              backgroundColor: theme.colors.border,
              borderRadius: theme.radii.sm,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
            },
          ]}
        >
          <Text variant="caption" color="textMuted">
            Paper money
          </Text>
        </View>
      </View>

      <Text variant="caption" color="textMuted">
        Total value
      </Text>
      <Text
        variant="title"
        color="text"
        accessibilityLabel={`Total value ${formatCents(equityCents)}`}
      >
        {formatCents(equityCents)}
      </Text>

      <Text
        variant="body"
        color={gainColor}
        accessibilityLabel={`Total gain or loss ${gainText} versus starting cash`}
      >
        {gainText}
      </Text>

      <Text variant="caption" color="textMuted" accessibilityLabel={`Cash ${formatCents(cashCents)}`}>
        Cash {formatCents(cashCents)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: 'row',
  },
  tag: {
    alignSelf: 'flex-start',
  },
});

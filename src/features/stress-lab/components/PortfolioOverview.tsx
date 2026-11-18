/**
 * PortfolioOverview (FR-1–FR-6).
 *
 * The top of the Stress Lab: the student's REAL paper portfolio, shown before
 * any simulation so it reads as the untouched starting point. It renders total
 * value, available cash, holding count, and current performance; an allocation
 * donut (by asset); and plain-language concentration/diversification indicators
 * with a bar for the largest sector. Every figure is formatted from integer
 * cents via lib/money and the analysis helpers (FEAT-002).
 *
 * This card carries a "Paper money" tag, never a SIMULATED badge — it is the
 * real overview, kept visually distinct from the simulated results dashboard
 * (FR-19). Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import {
  allocationByAsset,
  allocationBySector,
  concentrationIndicators,
} from '../analysis/portfolio-analysis';
import type { StressPortfolio } from '../data/use-stress-portfolio';
import { AllocationDonut } from './AllocationDonut';
import { ConcentrationBar } from './ConcentrationBar';
import { InfoTip } from './InfoTip';
import { formatShare } from './format-share';

export interface PortfolioOverviewProps {
  portfolio: StressPortfolio;
}

export function PortfolioOverview({ portfolio }: PortfolioOverviewProps) {
  const theme = useTheme();
  const { holdings, cashCents, totalValueCents, totalGainCents, totalGainBasisPoints } = portfolio;

  const assetSlices = allocationByAsset(holdings).map((a) => ({
    label: a.symbol,
    valueCents: a.valueCents,
    basisPoints: a.basisPoints,
  }));
  const sectors = allocationBySector(holdings);
  const concentration = concentrationIndicators(holdings);
  const gainColor = totalGainCents > 0 ? 'primary' : totalGainCents < 0 ? 'danger' : 'textMuted';

  return (
    <Card style={{ gap: theme.spacing.md }}>
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
            Paper money · your real portfolio
          </Text>
        </View>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted">
          Total value
        </Text>
        <Text variant="title" color="text" accessibilityLabel={`Total value ${formatCents(totalValueCents)}`}>
          {formatCents(totalValueCents)}
        </Text>
        <Text
          variant="body"
          color={gainColor}
          accessibilityLabel={`Total gain or loss ${formatSignedCents(totalGainCents)}, ${formatPercent(totalGainBasisPoints)}`}
        >
          {formatSignedCents(totalGainCents)} ({formatPercent(totalGainBasisPoints)})
        </Text>
      </View>

      <View style={[styles.stats, { gap: theme.spacing.md }]}>
        <Stat label="Cash" value={formatCents(cashCents)} theme={theme} />
        <Stat label="Holdings" value={`${holdings.length}`} theme={theme} />
        <Stat label="Sectors" value={`${concentration.distinctSectorCount}`} theme={theme} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Allocation by holding
        </Text>
        <AllocationDonut slices={assetSlices} accessibilityLabel="Allocation by holding" />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={styles.sectionHeader}>
          <Text variant="caption" color="textMuted" accessibilityRole="header">
            Concentration
          </Text>
          <InfoTip
            label="What is concentration?"
            text="Concentration is how much of your money sits in one holding or one sector. A lot in a single place means a problem there hits your whole portfolio harder."
          />
        </View>
        <Text variant="caption" color={concentration.isOverConcentrated ? 'danger' : 'textMuted'}>
          {concentration.summary}
        </Text>
        {concentration.largestSectorName ? (
          <ConcentrationBar
            label={`Largest sector: ${concentration.largestSectorName}`}
            basisPoints={concentration.largestSectorBasisPoints}
            warn={concentration.isOverConcentrated}
          />
        ) : null}
        {sectors.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }}>
            {sectors.map((s) => (
              <View key={s.sector} style={styles.sectorRow}>
                <Text variant="caption" color="text" numberOfLines={1} style={styles.sectorName}>
                  {s.sector}
                </Text>
                <Text variant="caption" color="textMuted">
                  {formatShare(s.basisPoints)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** One small labelled statistic in the overview stat row. */
function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: 'row',
  },
  tag: {
    alignSelf: 'flex-start',
  },
  stats: {
    flexDirection: 'row',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectorName: {
    flex: 1,
    minWidth: 0,
  },
});

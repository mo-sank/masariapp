/**
 * SectorExposure (FR-23).
 *
 * How each sector contributed to the simulated result, plus the callouts the
 * analysis layer derives: best- and worst-performing sectors and the sector
 * with the greatest portfolio exposure. Each row shows the sector's exposure
 * share and its simulated percent change with a non-colour direction glyph.
 * Figures come from `analyzeSectorExposure` over the persisted result. The card
 * is marked SIMULATED. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatPercent } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import { analyzeSectorExposure } from '../analysis/portfolio-analysis';
import type { SimulationResult } from '../engine/types';
import { InfoTip } from './InfoTip';
import { SimulatedBadge } from './SimulatedBadge';
import { formatShare } from './format-share';

export interface SectorExposureProps {
  result: SimulationResult;
}

/** Direction glyph + colour for a (possibly null) basis-point change. */
function direction(bp: number | null): { glyph: string; color: 'primary' | 'danger' | 'textMuted' } {
  if (bp === null || bp === 0) {
    return { glyph: '–', color: 'textMuted' };
  }
  return bp > 0 ? { glyph: '▲', color: 'primary' } : { glyph: '▼', color: 'danger' };
}

export function SectorExposure({ result }: SectorExposureProps) {
  const theme = useTheme();
  const analysis = analyzeSectorExposure(result);

  if (analysis.sectors.length === 0) {
    return null;
  }

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Text variant="caption" color="textMuted" accessibilityRole="header">
            Sector exposure
          </Text>
          <InfoTip
            label="What is sector exposure?"
            text="A sector is a group of similar companies (like technology or energy). Exposure is how much of your money is in each one. If one sector drops, the more you hold there, the more it moves your whole portfolio."
          />
        </View>
        <SimulatedBadge />
      </View>

      {analysis.greatestExposureSector ? (
        <Text variant="caption" color="textMuted">
          Most exposed: {analysis.greatestExposureSector.sector} (
          {formatShare(analysis.greatestExposureSector.exposureBasisPoints)})
        </Text>
      ) : null}
      {analysis.worstSector ? (
        <Text variant="caption" color="danger">
          Worst hit: {analysis.worstSector.sector} ({formatPercent(analysis.worstSector.changeBasisPoints)})
        </Text>
      ) : null}
      {analysis.bestSector && analysis.bestSector.changeBasisPoints !== null && analysis.bestSector.changeBasisPoints > 0 ? (
        <Text variant="caption" color="primary">
          Held up best: {analysis.bestSector.sector} ({formatPercent(analysis.bestSector.changeBasisPoints)})
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
        {analysis.sectors.map((s) => {
          const dir = direction(s.changeBasisPoints);
          return (
            <View
              key={s.sector}
              style={styles.row}
              accessibilityRole="summary"
              accessibilityLabel={`${s.sector}, exposure ${formatShare(s.exposureBasisPoints)}, simulated change ${formatPercent(s.changeBasisPoints)}`}
            >
              <Text variant="caption" color="text" numberOfLines={1} style={styles.sector}>
                {s.sector}
              </Text>
              <Text variant="caption" color="textMuted" style={styles.exposure}>
                {formatShare(s.exposureBasisPoints)}
              </Text>
              <Text variant="caption" color={dir.color} style={styles.change}>
                {dir.glyph} {formatPercent(s.changeBasisPoints)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sector: {
    flex: 1,
    minWidth: 0,
  },
  exposure: {
    width: 56,
    textAlign: 'right',
  },
  change: {
    width: 84,
    textAlign: 'right',
  },
});

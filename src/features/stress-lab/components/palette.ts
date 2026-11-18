/**
 * A small categorical palette for the allocation/sector charts.
 *
 * The theme tokens carry only semantic colours (primary, danger, …); the donut
 * and sector charts need a handful of distinguishable hues for adjacent slices.
 * These are fixed, colour-blind-friendly-ish values used purely for chart fills;
 * meaning in the Stress Lab is never carried by colour alone (labels and signs
 * accompany every figure), so this palette is decorative.
 */
export const CHART_PALETTE = [
  '#2563eb', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#a855f7', // purple
] as const;

/** Pick a stable palette colour for a slice index (wraps around the palette). */
export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

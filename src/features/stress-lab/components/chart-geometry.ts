/**
 * Pure chart geometry for the Stress Lab visualizations (FR-4, FR-21).
 *
 * The charts are drawn with react-native-svg, but all the arithmetic that turns
 * values into on-screen coordinates lives here, free of React and the native SVG
 * layer, so it can be unit-tested directly. The renderers
 * (`AllocationDonut`, `ConcentrationBar`, `StartVsSimulatedChart`) are thin
 * wrappers over these helpers — mirroring `src/features/trading/components/chart-geometry.ts`.
 *
 * Money arrives as integer cents; proportions are computed exactly and only the
 * final SVG coordinates are floats (never fed back into money math).
 */

/** One slice of the allocation donut, keyed by its source datum. */
export interface DonutSegment {
  /** The value this slice represents, in cents. */
  valueCents: number;
}

/** A segment projected to its sweep on the donut ring. */
export interface DonutArc {
  /** Start angle in degrees, measured clockwise from 12 o'clock (top). */
  startAngle: number;
  /** End angle in degrees, measured clockwise from 12 o'clock (top). */
  endAngle: number;
  /** The slice's fraction of the whole (0–1). */
  fraction: number;
  /** The index of the source segment, so the renderer can colour it. */
  index: number;
}

/** A point on the SVG canvas. */
export interface Point {
  x: number;
  y: number;
}

/** An SVG arc path plus the angles it spans, for one donut slice. */
export interface DonutArcPath extends DonutArc {
  /** The `d` attribute for an `<Path>` drawing this ring segment. */
  d: string;
}

/**
 * Turn allocation segments into clockwise donut arcs starting at 12 o'clock.
 * Zero-value (and, after an all-zero total, every) segments collapse to a
 * zero-width arc so the ring never over- or under-sweeps. Returns one arc per
 * input segment, in input order, so the caller's colour mapping stays stable.
 */
export function donutArcs(segments: readonly DonutSegment[]): DonutArc[] {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.valueCents), 0);
  const arcs: DonutArc[] = [];
  let cursor = 0;
  segments.forEach((segment, index) => {
    const fraction = total > 0 ? Math.max(0, segment.valueCents) / total : 0;
    const startAngle = cursor * 360;
    cursor += fraction;
    const endAngle = cursor * 360;
    arcs.push({ startAngle, endAngle, fraction, index });
  });
  return arcs;
}

/**
 * The point on a circle of `radius` centred at `center` for an angle measured
 * clockwise in degrees from 12 o'clock. Used to place arc endpoints and labels.
 */
export function pointOnCircle(center: Point, radius: number, angleDegrees: number): Point {
  // Convert "clockwise from top" to standard math radians (counter-clockwise
  // from the positive x-axis): top is -90° in screen space.
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(radians),
    y: center.y + radius * Math.sin(radians),
  };
}

/**
 * Build the SVG `<Path d=...>` for a single donut ring segment (an annulus
 * wedge between `innerRadius` and `outerRadius`). A full-circle slice
 * (fraction ≈ 1) is split so the arc flag never degenerates to a zero-length
 * path. Returns an empty `d` for a zero-width slice so the renderer can skip it.
 */
export function donutArcPath(
  arc: DonutArc,
  center: Point,
  outerRadius: number,
  innerRadius: number,
): DonutArcPath {
  if (arc.endAngle - arc.startAngle <= 0) {
    return { ...arc, d: '' };
  }
  // A single full-ring slice: draw it as two half-sweeps so SVG renders it.
  if (arc.endAngle - arc.startAngle >= 360) {
    const midAngle = arc.startAngle + 180;
    const first = donutArcPath(
      { ...arc, endAngle: midAngle },
      center,
      outerRadius,
      innerRadius,
    );
    const second = donutArcPath(
      { ...arc, startAngle: midAngle },
      center,
      outerRadius,
      innerRadius,
    );
    return { ...arc, d: `${first.d} ${second.d}` };
  }

  const outerStart = pointOnCircle(center, outerRadius, arc.startAngle);
  const outerEnd = pointOnCircle(center, outerRadius, arc.endAngle);
  const innerEnd = pointOnCircle(center, innerRadius, arc.endAngle);
  const innerStart = pointOnCircle(center, innerRadius, arc.startAngle);
  const largeArc = arc.endAngle - arc.startAngle > 180 ? 1 : 0;

  const d = [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${round(outerRadius)} ${round(outerRadius)} 0 ${largeArc} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${round(innerRadius)} ${round(innerRadius)} 0 ${largeArc} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    'Z',
  ].join(' ');

  return { ...arc, d };
}

/** A paired start-vs-simulated bar scaled to a shared pixel axis. */
export interface ComparisonBar {
  /** Starting value bar height in pixels. */
  startHeight: number;
  /** Simulated value bar height in pixels. */
  simulatedHeight: number;
  /** The raw starting value in cents. */
  startCents: number;
  /** The raw simulated value in cents. */
  simulatedCents: number;
}

/**
 * Scale a starting value and a simulated value onto a shared pixel axis so the
 * two bars are directly comparable. The taller of the two fills `maxHeight`;
 * the other is scaled proportionally. When both are 0 (empty portfolio) both
 * heights are 0. Negative inputs are clamped to 0 (a value cannot be negative).
 */
export function comparisonBars(
  startCents: number,
  simulatedCents: number,
  maxHeight: number,
): ComparisonBar {
  const start = Math.max(0, startCents);
  const simulated = Math.max(0, simulatedCents);
  const peak = Math.max(start, simulated);
  const scale = peak > 0 ? maxHeight / peak : 0;
  return {
    startHeight: start * scale,
    simulatedHeight: simulated * scale,
    startCents,
    simulatedCents,
  };
}

/**
 * Scale a single value's fill width (0–`maxWidth`) as a fraction of a whole,
 * used by the concentration bar. Clamped to [0, maxWidth]; a zero whole yields
 * a zero-width fill.
 */
export function fillWidth(valueCents: number, totalCents: number, maxWidth: number): number {
  if (totalCents <= 0) {
    return 0;
  }
  const fraction = Math.max(0, Math.min(1, valueCents / totalCents));
  return fraction * maxWidth;
}

/** Round to one decimal place so SVG path strings stay compact but smooth. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

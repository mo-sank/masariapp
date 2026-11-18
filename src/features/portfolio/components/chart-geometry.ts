/**
 * Pure chart geometry for the Portfolio value chart (design §6).
 *
 * Mirrors `src/features/trading/components/chart-geometry.ts`, following the
 * precedent set by `src/features/stress-lab/components/chart-geometry.ts` of a
 * feature-local geometry module rather than importing the trading one (which is
 * hard-coded to a `ChartBar { bar_date; close_cents }` shape). The arithmetic
 * that turns a series of daily equity points into on-screen x/y points lives
 * here, free of React and the native SVG layer, so it can be unit-tested
 * directly; `PortfolioValueChart` is a thin renderer over these helpers.
 *
 * Coordinates follow the SVG convention: x grows left→right, y grows top→bottom,
 * so a HIGHER equity maps to a LOWER y. We work in integer cents (one point per
 * daily snapshot, oldest-first — matching `usePortfolioHistory`) and flip the y
 * axis once, here, when projecting onto the pixel box. There is no trade-marker
 * code — the portfolio chart has none.
 */

/** The minimal shape this module needs: one daily equity point. */
export interface EquityPoint {
  /** Snapshot day, `YYYY-MM-DD` (ascending across the series). */
  snapDate: string;
  /** Equity in integer cents — the value we plot. */
  valueCents: number;
}

/** A plotted point in the SVG pixel box. */
export interface ChartPoint {
  x: number;
  y: number;
}

/** The pixel box the chart draws into, plus inner padding. */
export interface ChartLayout {
  width: number;
  height: number;
  /** Inner padding so the line never clips at the edges. */
  padding?: number;
}

/** The min/max equity used to scale the y axis (both in cents). */
export interface ValueDomain {
  minCents: number;
  maxCents: number;
}

/**
 * The lowest and highest equity across the series, used to scale the y axis.
 * Returns `null` for an empty series (nothing to scale). When every value is
 * equal, the domain is widened by one cent on each side so a flat line still
 * renders in the middle of the box rather than dividing by a zero range.
 */
export function valueDomain(points: readonly EquityPoint[]): ValueDomain | null {
  if (points.length === 0) {
    return null;
  }
  let minCents = points[0].valueCents;
  let maxCents = points[0].valueCents;
  for (const point of points) {
    if (point.valueCents < minCents) {
      minCents = point.valueCents;
    }
    if (point.valueCents > maxCents) {
      maxCents = point.valueCents;
    }
  }
  if (minCents === maxCents) {
    return { minCents: minCents - 1, maxCents: maxCents + 1 };
  }
  return { minCents, maxCents };
}

/** Clamp padding to at most a quarter of the smaller dimension so the plot area stays positive. */
function resolvePadding(layout: ChartLayout): number {
  const requested = layout.padding ?? 0;
  const maxPadding = Math.min(layout.width, layout.height) / 4;
  return Math.max(0, Math.min(requested, maxPadding));
}

/**
 * Project an equity value (cents) to a y pixel within the box, flipping the
 * axis so a higher value sits higher on screen (smaller y). The result is
 * clamped to the padded plot area so an out-of-domain value still lands on a
 * drawable edge rather than off-canvas.
 */
export function valueToY(
  valueCents: number,
  domain: ValueDomain,
  layout: ChartLayout,
): number {
  const padding = resolvePadding(layout);
  const top = padding;
  const bottom = layout.height - padding;
  const range = domain.maxCents - domain.minCents;
  if (range <= 0) {
    return (top + bottom) / 2;
  }
  const ratio = (valueCents - domain.minCents) / range;
  const clamped = Math.max(0, Math.min(1, ratio));
  // ratio 1 (max value) → top; ratio 0 (min value) → bottom.
  return bottom - clamped * (bottom - top);
}

/**
 * Project a series index (0-based, oldest first) to an x pixel, spreading the
 * points evenly across the padded plot width. A single-point series is centred.
 */
export function indexToX(index: number, count: number, layout: ChartLayout): number {
  const padding = resolvePadding(layout);
  const left = padding;
  const right = layout.width - padding;
  if (count <= 1) {
    return (left + right) / 2;
  }
  const step = (right - left) / (count - 1);
  return left + index * step;
}

/**
 * Turn the equity series into evenly-spaced pixel points for the line. Points
 * must be oldest-first (as `usePortfolioHistory` returns them). Returns an empty
 * array for an empty series.
 */
export function equityToPoints(
  points: readonly EquityPoint[],
  layout: ChartLayout,
): ChartPoint[] {
  const domain = valueDomain(points);
  if (!domain) {
    return [];
  }
  return points.map((point, index) => ({
    x: indexToX(index, points.length, layout),
    y: valueToY(point.valueCents, domain, layout),
  }));
}

/** Join plotted points into an SVG `points` attribute string for `<Polyline>`. */
export function pointsToPolyline(points: readonly ChartPoint[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

/** Round to one decimal place so SVG strings stay compact but smooth. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

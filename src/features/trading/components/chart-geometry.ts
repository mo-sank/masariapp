/**
 * Pure chart geometry for the stock-detail LineChart (requirements 5.2, 5.3, 3.3).
 *
 * The chart is drawn with react-native-svg, but all the arithmetic that turns a
 * series of daily bars (and the user's trade markers) into on-screen x/y points
 * lives here, free of React and the native SVG layer, so it can be unit-tested
 * directly. The `LineChart` component is a thin renderer over these helpers.
 *
 * Coordinates follow the SVG convention: x grows left→right, y grows top→bottom,
 * so a HIGHER price maps to a LOWER y. We work in close-price integer cents from
 * `quote_bars` (one point per daily bar, oldest-first — matching `useBars`) and
 * flip the y axis once, here, when projecting onto the pixel box.
 */

/** The minimal shape this module needs from a `quote_bars` row. */
export interface ChartBar {
  /** Trading day, `YYYY-MM-DD` (ascending across the series). */
  bar_date: string;
  /** Daily close in integer cents — the value we plot. */
  close_cents: number;
}

/** A plotted point in the SVG pixel box. */
export interface ChartPoint {
  x: number;
  y: number;
}

/** The pixel box the chart draws into, plus padding reserved for markers. */
export interface ChartLayout {
  width: number;
  height: number;
  /** Inner padding so the line/markers never clip at the edges. */
  padding?: number;
}

/** The min/max close used to scale the y axis (both in cents). */
export interface PriceDomain {
  minCents: number;
  maxCents: number;
}

/** A user trade projected onto the chart (requirement 5.3). */
export interface MarkerInput {
  /** `buy` or `sell` — drives the marker's color/shape in the renderer. */
  side: 'buy' | 'sell';
  /** When the order filled, ISO timestamp (orders.created_at). */
  created_at: string;
  /** Fill price in integer cents (orders.fill_price_cents). */
  fill_price_cents: number;
}

/** A trade marker placed at an x/y with the side carried through. */
export interface ChartMarker extends ChartPoint {
  side: 'buy' | 'sell';
}

/**
 * The lowest and highest close across the series, used to scale the y axis.
 * Returns `null` for an empty series (nothing to scale). When every close is
 * equal, the domain is widened by one cent on each side so a flat line still
 * renders in the middle of the box rather than dividing by a zero range.
 */
export function priceDomain(bars: readonly ChartBar[]): PriceDomain | null {
  if (bars.length === 0) {
    return null;
  }
  let minCents = bars[0].close_cents;
  let maxCents = bars[0].close_cents;
  for (const bar of bars) {
    if (bar.close_cents < minCents) {
      minCents = bar.close_cents;
    }
    if (bar.close_cents > maxCents) {
      maxCents = bar.close_cents;
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
 * Project a close price (cents) to a y pixel within the box, flipping the axis
 * so a higher price sits higher on screen (smaller y). The result is clamped to
 * the padded plot area so an out-of-domain price (e.g. a trade fill above the
 * visible range) still lands on a drawable edge rather than off-canvas.
 */
export function priceToY(
  priceCents: number,
  domain: PriceDomain,
  layout: ChartLayout,
): number {
  const padding = resolvePadding(layout);
  const top = padding;
  const bottom = layout.height - padding;
  const range = domain.maxCents - domain.minCents;
  if (range <= 0) {
    return (top + bottom) / 2;
  }
  const ratio = (priceCents - domain.minCents) / range;
  const clamped = Math.max(0, Math.min(1, ratio));
  // ratio 1 (max price) → top; ratio 0 (min price) → bottom.
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
 * Turn the bar series into evenly-spaced pixel points for the price line. Bars
 * must be oldest-first (as `useBars` returns them). Returns an empty array for
 * an empty series.
 */
export function barsToPoints(
  bars: readonly ChartBar[],
  layout: ChartLayout,
): ChartPoint[] {
  const domain = priceDomain(bars);
  if (!domain) {
    return [];
  }
  return bars.map((bar, index) => ({
    x: indexToX(index, bars.length, layout),
    y: priceToY(bar.close_cents, domain, layout),
  }));
}

/** Join plotted points into an SVG `points` attribute string for `<Polyline>`. */
export function pointsToPolyline(points: readonly ChartPoint[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

/**
 * Place the user's trade markers on the chart (requirement 5.3).
 *
 * Each marker's x comes from the trading day its fill falls on: we snap the
 * order's calendar date to the nearest bar in the series (markers off the left
 * edge of the range are dropped). Its y comes from the fill price on the same
 * cent-scaled axis as the line, so a buy below the line and a sell above it read
 * correctly. Orders without a fill price (never filled) are skipped.
 */
export function tradeMarkers(
  orders: readonly MarkerInput[],
  bars: readonly ChartBar[],
  layout: ChartLayout,
): ChartMarker[] {
  const domain = priceDomain(bars);
  if (!domain || bars.length === 0) {
    return [];
  }
  const markers: ChartMarker[] = [];
  for (const order of orders) {
    if (order.fill_price_cents == null) {
      continue;
    }
    const index = nearestBarIndex(order.created_at, bars);
    if (index == null) {
      continue;
    }
    markers.push({
      side: order.side,
      x: indexToX(index, bars.length, layout),
      y: priceToY(order.fill_price_cents, domain, layout),
    });
  }
  return markers;
}

/**
 * Index of the bar whose trading day is closest to (and not after, when
 * possible) the order's fill date. Orders dated before the first bar are
 * dropped (`null`); orders after the last bar snap to the last bar. Comparing
 * on the `YYYY-MM-DD` day avoids intraday/timezone drift between an ISO
 * timestamp and a bar's calendar date.
 */
export function nearestBarIndex(
  isoTimestamp: string,
  bars: readonly ChartBar[],
): number | null {
  if (bars.length === 0) {
    return null;
  }
  const day = isoTimestamp.slice(0, 10);
  if (day < bars[0].bar_date) {
    return null;
  }
  // Walk forward to the last bar whose date is <= the fill day.
  let chosen = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].bar_date <= day) {
      chosen = i;
    } else {
      break;
    }
  }
  return chosen;
}

/** Round to one decimal place so SVG strings stay compact but smooth. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

import {
  barsToPoints,
  indexToX,
  nearestBarIndex,
  pointsToPolyline,
  priceDomain,
  priceToY,
  tradeMarkers,
  type ChartBar,
  type ChartLayout,
  type MarkerInput,
} from './chart-geometry';

const layout: ChartLayout = { width: 300, height: 100, padding: 10 };

function bar(bar_date: string, close_cents: number): ChartBar {
  return { bar_date, close_cents };
}

describe('priceDomain', () => {
  it('returns null for an empty series', () => {
    expect(priceDomain([])).toBeNull();
  });

  it('finds the min and max close across the series', () => {
    const domain = priceDomain([bar('2025-01-01', 10000), bar('2025-01-02', 12000), bar('2025-01-03', 9000)]);
    expect(domain).toEqual({ minCents: 9000, maxCents: 12000 });
  });

  it('widens a flat series by one cent each side so the range is non-zero', () => {
    const domain = priceDomain([bar('2025-01-01', 10000), bar('2025-01-02', 10000)]);
    expect(domain).toEqual({ minCents: 9999, maxCents: 10001 });
  });
});

describe('priceToY', () => {
  const domain = { minCents: 9000, maxCents: 12000 };

  it('maps the max price to the top of the padded box and the min to the bottom', () => {
    // padding 10 → top=10, bottom=90.
    expect(priceToY(12000, domain, layout)).toBe(10);
    expect(priceToY(9000, domain, layout)).toBe(90);
  });

  it('maps a mid price to the middle (higher price = lower y)', () => {
    expect(priceToY(10500, domain, layout)).toBe(50);
  });

  it('clamps prices outside the domain to the plot edges', () => {
    expect(priceToY(20000, domain, layout)).toBe(10);
    expect(priceToY(0, domain, layout)).toBe(90);
  });
});

describe('indexToX', () => {
  it('centres a single point', () => {
    expect(indexToX(0, 1, layout)).toBe(150);
  });

  it('spreads points evenly across the padded width', () => {
    // left=10, right=290, 3 points → step 140.
    expect(indexToX(0, 3, layout)).toBe(10);
    expect(indexToX(1, 3, layout)).toBe(150);
    expect(indexToX(2, 3, layout)).toBe(290);
  });
});

describe('barsToPoints / pointsToPolyline', () => {
  it('projects the series into pixel points oldest-first', () => {
    const bars = [bar('2025-01-01', 9000), bar('2025-01-02', 12000)];
    const points = barsToPoints(bars, layout);
    expect(points).toEqual([
      { x: 10, y: 90 },
      { x: 290, y: 10 },
    ]);
  });

  it('returns no points for an empty series', () => {
    expect(barsToPoints([], layout)).toEqual([]);
  });

  it('serialises points into an SVG polyline string', () => {
    expect(
      pointsToPolyline([
        { x: 10, y: 90 },
        { x: 290.44, y: 10.07 },
      ]),
    ).toBe('10,90 290.4,10.1');
  });
});

describe('nearestBarIndex', () => {
  const bars = [bar('2025-01-02', 100), bar('2025-01-03', 100), bar('2025-01-06', 100)];

  it('drops a date before the first bar', () => {
    expect(nearestBarIndex('2025-01-01T15:00:00.000Z', bars)).toBeNull();
  });

  it('snaps an exact day to its bar', () => {
    expect(nearestBarIndex('2025-01-03T20:00:00.000Z', bars)).toBe(1);
  });

  it('snaps a gap day (weekend) back to the prior trading bar', () => {
    // 2025-01-04 is a Saturday with no bar → prior bar is index 1 (Jan 3).
    expect(nearestBarIndex('2025-01-04T12:00:00.000Z', bars)).toBe(1);
  });

  it('snaps a date after the last bar to the last bar', () => {
    expect(nearestBarIndex('2025-02-01T12:00:00.000Z', bars)).toBe(2);
  });

  it('returns null for an empty series', () => {
    expect(nearestBarIndex('2025-01-03T00:00:00.000Z', [])).toBeNull();
  });
});

describe('tradeMarkers', () => {
  const bars = [bar('2025-01-01', 9000), bar('2025-01-02', 10000), bar('2025-01-03', 12000)];

  it('places buys and sells at the fill day and price', () => {
    const orders: MarkerInput[] = [
      { side: 'buy', created_at: '2025-01-01T14:30:00.000Z', fill_price_cents: 9000 },
      { side: 'sell', created_at: '2025-01-03T19:00:00.000Z', fill_price_cents: 12000 },
    ];
    const markers = tradeMarkers(orders, bars, layout);
    expect(markers).toEqual([
      { side: 'buy', x: 10, y: 90 },
      { side: 'sell', x: 290, y: 10 },
    ]);
  });

  it('skips orders with no fill price and orders before the range', () => {
    const orders: MarkerInput[] = [
      { side: 'buy', created_at: '2025-01-02T14:30:00.000Z', fill_price_cents: null as unknown as number },
      { side: 'buy', created_at: '2024-12-01T14:30:00.000Z', fill_price_cents: 10000 },
    ];
    expect(tradeMarkers(orders, bars, layout)).toEqual([]);
  });

  it('returns no markers when there are no bars', () => {
    const orders: MarkerInput[] = [
      { side: 'buy', created_at: '2025-01-01T14:30:00.000Z', fill_price_cents: 9000 },
    ];
    expect(tradeMarkers(orders, [], layout)).toEqual([]);
  });
});

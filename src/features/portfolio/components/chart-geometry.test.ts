import {
  equityToPoints,
  indexToX,
  pointsToPolyline,
  valueDomain,
  valueToY,
  type ChartLayout,
  type EquityPoint,
} from './chart-geometry';

const layout: ChartLayout = { width: 300, height: 100, padding: 10 };

function point(snapDate: string, valueCents: number): EquityPoint {
  return { snapDate, valueCents };
}

describe('valueDomain', () => {
  it('returns null for an empty series', () => {
    expect(valueDomain([])).toBeNull();
  });

  it('finds the min and max value across the series', () => {
    const domain = valueDomain([
      point('2025-01-01', 1000000),
      point('2025-01-02', 1200000),
      point('2025-01-03', 900000),
    ]);
    expect(domain).toEqual({ minCents: 900000, maxCents: 1200000 });
  });

  it('widens a flat series by one cent each side so the range is non-zero', () => {
    const domain = valueDomain([point('2025-01-01', 1000000), point('2025-01-02', 1000000)]);
    expect(domain).toEqual({ minCents: 999999, maxCents: 1000001 });
  });
});

describe('valueToY', () => {
  const domain = { minCents: 9000, maxCents: 12000 };

  it('maps the max value to the top of the padded box and the min to the bottom', () => {
    // padding 10 → top=10, bottom=90.
    expect(valueToY(12000, domain, layout)).toBe(10);
    expect(valueToY(9000, domain, layout)).toBe(90);
  });

  it('maps a mid value to the middle (higher value = lower y)', () => {
    expect(valueToY(10500, domain, layout)).toBe(50);
  });

  it('clamps values outside the domain to the plot edges', () => {
    expect(valueToY(20000, domain, layout)).toBe(10);
    expect(valueToY(0, domain, layout)).toBe(90);
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

describe('equityToPoints / pointsToPolyline', () => {
  it('projects the series into pixel points oldest-first', () => {
    const points = equityToPoints(
      [point('2025-01-01', 9000), point('2025-01-02', 12000)],
      layout,
    );
    expect(points).toEqual([
      { x: 10, y: 90 },
      { x: 290, y: 10 },
    ]);
  });

  it('centres a single-point series', () => {
    const points = equityToPoints([point('2025-01-01', 10000)], layout);
    // A flat single point sits centred (x) and mid-box (y, flat domain ±1).
    expect(points).toEqual([{ x: 150, y: 50 }]);
  });

  it('returns no points for an empty series', () => {
    expect(equityToPoints([], layout)).toEqual([]);
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

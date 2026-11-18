import {
  comparisonBars,
  donutArcPath,
  donutArcs,
  fillWidth,
  pointOnCircle,
} from './chart-geometry';

describe('donutArcs', () => {
  it('sweeps a full 360 degrees across all slices', () => {
    const arcs = donutArcs([{ valueCents: 2500 }, { valueCents: 2500 }, { valueCents: 5000 }]);
    expect(arcs[0].startAngle).toBeCloseTo(0);
    expect(arcs[arcs.length - 1].endAngle).toBeCloseTo(360);
  });

  it('sizes each slice proportionally', () => {
    const arcs = donutArcs([{ valueCents: 7500 }, { valueCents: 2500 }]);
    expect(arcs[0].fraction).toBeCloseTo(0.75);
    expect(arcs[1].fraction).toBeCloseTo(0.25);
  });

  it('keeps arcs in input order with their source index', () => {
    const arcs = donutArcs([{ valueCents: 1000 }, { valueCents: 9000 }]);
    expect(arcs.map((a) => a.index)).toEqual([0, 1]);
  });

  it('collapses every slice to zero width when the total is zero', () => {
    const arcs = donutArcs([{ valueCents: 0 }, { valueCents: 0 }]);
    expect(arcs.every((a) => a.fraction === 0)).toBe(true);
    expect(arcs.every((a) => a.startAngle === 0 && a.endAngle === 0)).toBe(true);
  });

  it('treats a negative value as zero', () => {
    const arcs = donutArcs([{ valueCents: -500 }, { valueCents: 1000 }]);
    expect(arcs[0].fraction).toBe(0);
    expect(arcs[1].fraction).toBeCloseTo(1);
  });
});

describe('pointOnCircle', () => {
  const center = { x: 50, y: 50 };

  it('places 0 degrees at the top (12 o-clock)', () => {
    const p = pointOnCircle(center, 50, 0);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
  });

  it('places 90 degrees at the right (3 o-clock)', () => {
    const p = pointOnCircle(center, 50, 90);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });
});

describe('donutArcPath', () => {
  const center = { x: 50, y: 50 };

  it('returns an empty path for a zero-width slice', () => {
    const [arc] = donutArcs([{ valueCents: 0 }]);
    expect(donutArcPath(arc, center, 50, 30).d).toBe('');
  });

  it('builds a non-empty arc path for a real slice', () => {
    const [arc] = donutArcs([{ valueCents: 2500 }, { valueCents: 2500 }]);
    const path = donutArcPath(arc, center, 50, 30);
    expect(path.d).toMatch(/^M /);
    expect(path.d).toContain('A ');
  });

  it('splits a full-circle slice into two sweeps', () => {
    const [arc] = donutArcs([{ valueCents: 1000 }]);
    const path = donutArcPath(arc, center, 50, 30);
    // Two sub-paths means two move commands.
    expect((path.d.match(/M /g) ?? []).length).toBe(2);
  });
});

describe('comparisonBars', () => {
  it('fills the taller bar to maxHeight and scales the other', () => {
    const bars = comparisonBars(300000, 192500, 100);
    expect(bars.startHeight).toBeCloseTo(100);
    expect(bars.simulatedHeight).toBeCloseTo((192500 / 300000) * 100);
  });

  it('handles a gain where simulated is taller', () => {
    const bars = comparisonBars(100000, 150000, 100);
    expect(bars.simulatedHeight).toBeCloseTo(100);
    expect(bars.startHeight).toBeCloseTo(66.666, 1);
  });

  it('returns zero heights when both values are zero', () => {
    const bars = comparisonBars(0, 0, 100);
    expect(bars.startHeight).toBe(0);
    expect(bars.simulatedHeight).toBe(0);
  });

  it('clamps negative values to zero', () => {
    const bars = comparisonBars(-100, 50, 100);
    expect(bars.startHeight).toBe(0);
    expect(bars.simulatedHeight).toBeCloseTo(100);
  });
});

describe('fillWidth', () => {
  it('scales a value as a fraction of the whole', () => {
    expect(fillWidth(2500, 10000, 200)).toBeCloseTo(50);
  });

  it('clamps to the full width', () => {
    expect(fillWidth(20000, 10000, 200)).toBe(200);
  });

  it('returns zero for a zero whole', () => {
    expect(fillWidth(100, 0, 200)).toBe(0);
  });
});

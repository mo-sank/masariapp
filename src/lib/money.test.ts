import {
  centsToDollars,
  computeGainLoss,
  dollarsToCents,
  formatCents,
  formatPercent,
  formatSignedCents,
  MoneyParseError,
  parseDollarsToCents,
  pctChange,
} from './money';

describe('formatCents', () => {
  it('formats whole and fractional dollars with two decimals', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(50)).toBe('$0.50');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(12345)).toBe('$123.45');
  });

  it('groups thousands with commas', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(100000000)).toBe('$1,000,000.00');
  });

  it('renders negative amounts with a leading minus', () => {
    expect(formatCents(-100)).toBe('-$1.00');
    expect(formatCents(-5)).toBe('-$0.05');
  });

  it('throws on a non-integer cent value (float math leaked in)', () => {
    expect(() => formatCents(10.5)).toThrow(MoneyParseError);
  });
});

describe('formatSignedCents', () => {
  it('shows an explicit sign for non-zero amounts', () => {
    expect(formatSignedCents(1200)).toBe('+$12.00');
    expect(formatSignedCents(-1200)).toBe('-$12.00');
  });

  it('shows zero without a sign', () => {
    expect(formatSignedCents(0)).toBe('$0.00');
  });
});

describe('centsToDollars', () => {
  it('converts integer cents to a dollars number', () => {
    expect(centsToDollars(12345)).toBe(123.45);
    expect(centsToDollars(0)).toBe(0);
    expect(centsToDollars(-100)).toBe(-1);
  });

  it('throws on a non-integer input', () => {
    expect(() => centsToDollars(1.5)).toThrow(MoneyParseError);
  });
});

describe('dollarsToCents', () => {
  it('rounds half a cent up away from zero', () => {
    // Classic float-representation cases that naive Math.round(x*100) gets
    // wrong; the snap-to-six-decimals step fixes them.
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(2.675)).toBe(268);
  });

  it('converts common two-decimal values exactly', () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(123.45)).toBe(12345);
  });

  it('throws on a non-finite number', () => {
    expect(() => dollarsToCents(Number.NaN)).toThrow(MoneyParseError);
    expect(() => dollarsToCents(Number.POSITIVE_INFINITY)).toThrow(MoneyParseError);
  });
});

describe('parseDollarsToCents', () => {
  it('parses whole dollars', () => {
    expect(parseDollarsToCents('5')).toBe(500);
    expect(parseDollarsToCents('1234')).toBe(123400);
  });

  it('parses one and two decimal places', () => {
    expect(parseDollarsToCents('12.5')).toBe(1250);
    expect(parseDollarsToCents('12.50')).toBe(1250);
    expect(parseDollarsToCents('0.09')).toBe(9);
  });

  it('tolerates a leading $, commas, and surrounding whitespace', () => {
    expect(parseDollarsToCents(' $1,234.56 ')).toBe(123456);
    expect(parseDollarsToCents('$0.01')).toBe(1);
  });

  it('avoids float representation error by parsing digits, not multiplying', () => {
    // 0.1 + 0.2 problems never arise because we never do float math here.
    expect(parseDollarsToCents('0.10')).toBe(10);
    expect(parseDollarsToCents('0.20')).toBe(20);
    expect(parseDollarsToCents('0.30')).toBe(30);
  });

  it('rejects more than two decimal places (sub-cent precision)', () => {
    expect(() => parseDollarsToCents('1.005')).toThrow(MoneyParseError);
    expect(() => parseDollarsToCents('0.001')).toThrow(MoneyParseError);
  });

  it('rejects empty, non-numeric, and negative input', () => {
    expect(() => parseDollarsToCents('')).toThrow(MoneyParseError);
    expect(() => parseDollarsToCents('   ')).toThrow(MoneyParseError);
    expect(() => parseDollarsToCents('abc')).toThrow(MoneyParseError);
    expect(() => parseDollarsToCents('-5')).toThrow(MoneyParseError);
    expect(() => parseDollarsToCents('1.2.3')).toThrow(MoneyParseError);
  });
});

describe('pctChange', () => {
  it('returns basis points for a gain and a loss', () => {
    expect(pctChange(11000, 10000)).toBe(1000); // +10.00%
    expect(pctChange(9475, 10000)).toBe(-525); // -5.25%
    expect(pctChange(10000, 10000)).toBe(0);
  });

  it('rounds to the nearest basis point', () => {
    // 100 -> 100.01 reference: tiny moves round sensibly.
    expect(pctChange(10001, 10000)).toBe(1); // 0.01%
    expect(pctChange(333, 1000)).toBe(-6670); // -66.70%
  });

  it('returns null when the basis is zero', () => {
    expect(pctChange(500, 0)).toBeNull();
  });

  it('throws on non-integer inputs', () => {
    expect(() => pctChange(1.5, 100)).toThrow(MoneyParseError);
  });
});

describe('formatPercent', () => {
  it('formats signed percents from basis points', () => {
    expect(formatPercent(1000)).toBe('+10.00%');
    expect(formatPercent(-525)).toBe('-5.25%');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatPercent(5)).toBe('+0.05%');
  });

  it('renders a dash for an undefined (null) percent', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('computeGainLoss', () => {
  it('computes value, gain, and percent for a gaining position', () => {
    // 10 shares, now 150.00 each; total cost 1000.00.
    const result = computeGainLoss(10, 15000, 100000);
    expect(result.valueCents).toBe(150000);
    expect(result.gainCents).toBe(50000);
    expect(result.gainBasisPoints).toBe(5000); // +50.00%
  });

  it('computes a loss', () => {
    const result = computeGainLoss(4, 2000, 10000);
    expect(result.valueCents).toBe(8000);
    expect(result.gainCents).toBe(-2000);
    expect(result.gainBasisPoints).toBe(-2000); // -20.00%
  });

  it('handles a zero cost basis without dividing by zero', () => {
    const result = computeGainLoss(1, 500, 0);
    expect(result.valueCents).toBe(500);
    expect(result.gainCents).toBe(500);
    expect(result.gainBasisPoints).toBeNull();
  });

  it('throws when qty is not an integer', () => {
    expect(() => computeGainLoss(1.5, 500, 100)).toThrow(MoneyParseError);
  });
});

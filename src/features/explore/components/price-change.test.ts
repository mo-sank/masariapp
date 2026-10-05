import { computeDayChange } from './price-change';

describe('computeDayChange', () => {
  it('reports a gain with signed dollar and percent text', () => {
    const change = computeDayChange(11000, 10000);
    expect(change.direction).toBe(1);
    expect(change.text).toBe('+$10.00 (+10.00%)');
  });

  it('reports a loss with a negative sign', () => {
    const change = computeDayChange(9475, 10000);
    expect(change.direction).toBe(-1);
    expect(change.text).toBe('-$5.25 (-5.25%)');
  });

  it('reports flat when price equals previous close', () => {
    const change = computeDayChange(10000, 10000);
    expect(change.direction).toBe(0);
    expect(change.text).toBe('$0.00 (0.00%)');
  });

  it('shows a dash when the previous close is unknown', () => {
    expect(computeDayChange(10000, null).text).toBe('—');
    expect(computeDayChange(10000, undefined).direction).toBe(0);
  });
});

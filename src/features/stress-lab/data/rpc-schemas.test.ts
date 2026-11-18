import {
  parseStressSimulation,
  stressSimulationSchema,
  assetResultSchema,
} from './rpc-schemas';

/** A well-formed record_simulation row. */
function validRow() {
  return {
    id: 'sim-1',
    user_id: 'auth0|abc',
    scenario_id: 'crisis_2008',
    phase: 'shock',
    starting_value_cents: 300000,
    simulated_value_cents: 192500,
    change_cents: -107500,
    change_basis_points: -3583,
    cash_cents: 50000,
    holdings_snapshot: [
      { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 10, current_value_cents: 150000 },
      { symbol: 'XYZ', name: 'Unclassified Co', sector: null, qty: 2, current_value_cents: 10000 },
    ],
    assumptions_snapshot: { broad_market: -0.3, sectors: {} },
    asset_results: [
      {
        symbol: 'AAPL',
        name: 'Apple',
        sector: 'Information Technology',
        qty: 10,
        original_value_cents: 150000,
        shock: -0.35,
        used_broad_market: false,
        simulated_change_cents: -52500,
        simulated_change_bp: -3500,
        simulated_value_cents: 97500,
      },
    ],
    created_at: '2025-01-08T00:00:00.000Z',
  };
}

describe('parseStressSimulation', () => {
  it('parses a well-formed row into typed arrays', () => {
    const row = parseStressSimulation(validRow());
    expect(row.holdings_snapshot).toHaveLength(2);
    expect(row.asset_results[0].used_broad_market).toBe(false);
    expect(row.holdings_snapshot[1].sector).toBeNull();
  });

  it('accepts a null change_basis_points (zero starting value)', () => {
    const row = parseStressSimulation({ ...validRow(), change_basis_points: null });
    expect(row.change_basis_points).toBeNull();
  });

  it('accepts a null simulated_change_bp on an asset result', () => {
    const base = validRow();
    const row = parseStressSimulation({
      ...base,
      asset_results: [{ ...base.asset_results[0], simulated_change_bp: null }],
    });
    expect(row.asset_results[0].simulated_change_bp).toBeNull();
  });

  it('rejects a non-integer cents field', () => {
    expect(() => parseStressSimulation({ ...validRow(), starting_value_cents: 1.5 })).toThrow();
  });

  it('rejects a missing jsonb column', () => {
    const { asset_results: _omit, ...withoutResults } = validRow();
    expect(() => parseStressSimulation(withoutResults)).toThrow();
  });

  it('rejects a malformed asset result element', () => {
    const base = validRow();
    const bad = { ...base, asset_results: [{ symbol: 'AAPL' }] };
    expect(() => parseStressSimulation(bad)).toThrow();
  });

  it('exposes the row and element schemas for reuse', () => {
    expect(stressSimulationSchema.safeParse(validRow()).success).toBe(true);
    expect(assetResultSchema.safeParse(validRow().asset_results[0]).success).toBe(true);
  });
});

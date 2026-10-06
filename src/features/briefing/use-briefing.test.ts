// The supabase client pulls native modules in via its real import; mock it so
// these parser tests load without the real client. The parsing under test needs
// no client, only the RPC's return shape.
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { fetchBriefing } from './use-briefing';

describe('fetchBriefing', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls get_daily_briefing with no arguments', async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await fetchBriefing();
    expect(mockRpc).toHaveBeenCalledWith('get_daily_briefing');
  });

  it('parses a full payload into the typed briefing shape', async () => {
    mockRpc.mockResolvedValue({
      data: {
        top_gainer: {
          symbol: 'GAIN',
          name: 'Gainer Co',
          price_cents: 11000,
          prev_close_cents: 10000,
          change_bps: 1000,
        },
        top_loser: {
          symbol: 'DROP',
          name: 'Dropper Co',
          price_cents: 2300,
          prev_close_cents: 2500,
          change_bps: -800,
        },
        portfolio_day_change_cents: 2600,
        market_state: 'regular',
        tip_index: 3,
      },
      error: null,
    });

    const briefing = await fetchBriefing();

    expect(briefing.topGainer).toEqual({
      symbol: 'GAIN',
      name: 'Gainer Co',
      priceCents: 11000,
      prevCloseCents: 10000,
      changeBasisPoints: 1000,
    });
    expect(briefing.topLoser?.symbol).toBe('DROP');
    expect(briefing.topLoser?.changeBasisPoints).toBe(-800);
    expect(briefing.portfolioDayChangeCents).toBe(2600);
    expect(briefing.marketState).toBe('regular');
    expect(briefing.tipIndex).toBe(3);
  });

  it('maps null movers to null (no measurable movers)', async () => {
    mockRpc.mockResolvedValue({
      data: {
        top_gainer: null,
        top_loser: null,
        portfolio_day_change_cents: 0,
        market_state: 'closed',
        tip_index: 0,
      },
      error: null,
    });

    const briefing = await fetchBriefing();
    expect(briefing.topGainer).toBeNull();
    expect(briefing.topLoser).toBeNull();
    expect(briefing.marketState).toBe('closed');
  });

  it('defaults an unknown market_state to closed and missing fields to safe values', async () => {
    mockRpc.mockResolvedValue({
      data: { market_state: 'something_else' },
      error: null,
    });

    const briefing = await fetchBriefing();
    expect(briefing.marketState).toBe('closed');
    expect(briefing.portfolioDayChangeCents).toBe(0);
    expect(briefing.tipIndex).toBe(0);
    expect(briefing.topGainer).toBeNull();
  });

  it('falls back a mover name to its symbol when the name is missing', async () => {
    mockRpc.mockResolvedValue({
      data: { top_gainer: { symbol: 'AAA', price_cents: 100, prev_close_cents: 90, change_bps: 1111 } },
      error: null,
    });

    const briefing = await fetchBriefing();
    expect(briefing.topGainer?.name).toBe('AAA');
  });

  it('throws the raw error on failure (e.g. feature_locked)', async () => {
    const error = { message: 'feature_locked' };
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(fetchBriefing()).rejects.toBe(error);
  });
});

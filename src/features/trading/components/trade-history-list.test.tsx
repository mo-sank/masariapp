import { cleanup, render } from '@testing-library/react-native';

import { TradeHistoryList } from './trade-history-list';
import { ThemeProvider } from '../../../theme/theme-provider';
import type { Database } from '../../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ReflectionRow = Database['public']['Tables']['trade_reflections']['Row'];

function makeOrder(overrides: Partial<OrderRow>): OrderRow {
  return {
    id: 'o1',
    account_id: 'acc1',
    user_id: 'u1',
    symbol: 'AAPL',
    side: 'buy',
    order_type: 'market',
    qty: 2,
    status: 'filled',
    fill_price_cents: 15000,
    total_cents: 30000,
    realized_pl_cents: null,
    price_as_of: null,
    price_source: 'delayed_quote',
    rationale_tags: [],
    rationale_text: null,
    idempotency_key: 'k1',
    created_at: '2025-01-10T15:00:00Z',
    ...overrides,
  };
}

function makeReflection(overrides: Partial<ReflectionRow>): ReflectionRow {
  return {
    id: 'r1',
    order_id: 'o-sell',
    user_id: 'u1',
    expectation: 'better',
    note: null,
    created_at: '2025-01-10T16:00:00Z',
    ...overrides,
  };
}

async function renderList(ui: React.ReactElement) {
  return await render(<ThemeProvider>{ui}</ThemeProvider>);
}

afterEach(() => {
  cleanup();
});

describe('<TradeHistoryList />', () => {
  it('renders a buy row with rationale tags and note (10.1)', async () => {
    const buy = makeOrder({
      id: 'o-buy',
      side: 'buy',
      qty: 2,
      symbol: 'AAPL',
      fill_price_cents: 15000,
      total_cents: 30000,
      rationale_tags: ['know_the_brand', 'growing_company'],
      rationale_text: 'Been using their stuff for years',
    });

    const view = await renderList(
      <TradeHistoryList orders={[buy]} reflectionsByOrder={new Map()} />,
    );

    expect(view.getByText('Bought 2 shares of AAPL')).toBeTruthy();
    expect(view.getByText('$150.00')).toBeTruthy(); // price
    expect(view.getByText('$300.00')).toBeTruthy(); // total
    // Rationale tag ids are shown as their friendly labels.
    expect(view.getByText('I know the brand · Growing company')).toBeTruthy();
    expect(view.getByText('Been using their stuff for years')).toBeTruthy();
    // A buy has no realized P&L line.
    expect(view.queryByText('Realized P&L')).toBeNull();
  });

  it('renders a sell row with realized P&L and its reflection (10.1, 9.2)', async () => {
    const sell = makeOrder({
      id: 'o-sell',
      side: 'sell',
      qty: 2,
      symbol: 'AAPL',
      fill_price_cents: 16000,
      total_cents: 32000,
      realized_pl_cents: 2000,
      rationale_tags: [],
    });
    const reflection = makeReflection({
      order_id: 'o-sell',
      expectation: 'as_expected',
      note: 'Took my profit',
    });
    const map = new Map([[reflection.order_id, reflection]]);

    const view = await renderList(<TradeHistoryList orders={[sell]} reflectionsByOrder={map} />);

    expect(view.getByText('Sold 2 shares of AAPL')).toBeTruthy();
    expect(view.getByText('Realized P&L')).toBeTruthy();
    expect(view.getByText('+$20.00')).toBeTruthy();
    // Reflection joined by order_id, shown with its label and private note.
    expect(view.getByText('Reflection')).toBeTruthy();
    expect(view.getByText('As expected')).toBeTruthy();
    expect(view.getByText('Took my profit')).toBeTruthy();
  });

  it('renders a loss on a sell with a negative realized P&L', async () => {
    const sell = makeOrder({
      id: 'o-loss',
      side: 'sell',
      qty: 1,
      realized_pl_cents: -500,
      rationale_tags: [],
    });

    const view = await renderList(
      <TradeHistoryList orders={[sell]} reflectionsByOrder={new Map()} />,
    );

    expect(view.getByText('-$5.00')).toBeTruthy();
  });

  it('renders newest-first order as given, each as its own card', async () => {
    const newer = makeOrder({ id: 'o-new', symbol: 'MSFT', qty: 1 });
    const older = makeOrder({ id: 'o-old', symbol: 'AAPL', qty: 3 });

    const view = await renderList(
      <TradeHistoryList orders={[newer, older]} reflectionsByOrder={new Map()} />,
    );

    expect(view.getByText('Bought 1 share of MSFT')).toBeTruthy();
    expect(view.getByText('Bought 3 shares of AAPL')).toBeTruthy();
  });
});

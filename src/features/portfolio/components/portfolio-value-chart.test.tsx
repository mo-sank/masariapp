import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { PortfolioValueChart } from './portfolio-value-chart';
import type { EquityPoint } from './chart-geometry';
import { ThemeProvider } from '../../../theme/theme-provider';

function point(snapDate: string, valueCents: number): EquityPoint {
  return { snapDate, valueCents };
}

function renderChart(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * The chart measures its width via `onLayout`, which test-renderer does not fire
 * automatically. Fire it so `width > 0` and the SVG primitives render.
 */
function layoutChart(view: Awaited<ReturnType<typeof renderChart>>) {
  const chart = view.getByLabelText(/Portfolio value,/);
  fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 300, height: 200 } } });
}

afterEach(() => {
  cleanup();
});

describe('<PortfolioValueChart />', () => {
  it('shows the empty copy when empty', async () => {
    const view = await renderChart(
      <PortfolioValueChart points={[point('2025-01-01', 1000000)]} range="3M" empty />,
    );
    layoutChart(view);
    expect(view.getByText('No chart data yet')).toBeTruthy();
    expect(view.queryByTestId('portfolio-value-line')).toBeNull();
    expect(view.queryByTestId('portfolio-value-dot')).toBeNull();
  });

  it('shows the empty copy when there are no points', async () => {
    const view = await renderChart(<PortfolioValueChart points={[]} range="ALL" />);
    layoutChart(view);
    expect(view.getByText('No chart data yet')).toBeTruthy();
  });

  it('renders a polyline for two or more points', async () => {
    const points = [
      point('2025-01-01', 1000000),
      point('2025-01-02', 1050000),
      point('2025-01-03', 1100000),
    ];
    const view = await renderChart(<PortfolioValueChart points={points} range="1M" />);
    layoutChart(view);
    expect(await view.findByTestId('portfolio-value-line')).toBeTruthy();
    expect(view.queryByTestId('portfolio-value-dot')).toBeNull();
  });

  it('renders a single dot for exactly one point', async () => {
    const view = await renderChart(
      <PortfolioValueChart points={[point('2025-01-01', 1000000)]} range="1M" />,
    );
    layoutChart(view);
    expect(await view.findByTestId('portfolio-value-dot')).toBeTruthy();
    expect(view.queryByTestId('portfolio-value-line')).toBeNull();
  });

  it('tints a gain green and carries an up sign in the accessibility label', async () => {
    const points = [point('2025-01-01', 1000000), point('2025-01-02', 1100000)];
    const view = await renderChart(<PortfolioValueChart points={points} range="3M" />);
    // +$1,000.00 change, +10.00%.
    expect(view.getByText('+$1,000.00 (+10.00%)')).toBeTruthy();
    expect(view.getByLabelText(/Change up .* over 3M/)).toBeTruthy();
  });

  it('tints a loss red and carries a down sign in the accessibility label', async () => {
    const points = [point('2025-01-01', 1000000), point('2025-01-02', 900000)];
    const view = await renderChart(<PortfolioValueChart points={points} range="1Y" />);
    expect(view.getByText('-$1,000.00 (-10.00%)')).toBeTruthy();
    expect(view.getByLabelText(/Change down .* over 1Y/)).toBeTruthy();
  });

  it('shows the loading placeholder while loading', async () => {
    const view = await renderChart(
      <PortfolioValueChart points={[]} range="3M" loading />,
    );
    layoutChart(view);
    expect(view.getByText('Loading chart…')).toBeTruthy();
    expect(view.queryByText('No chart data yet')).toBeNull();
  });
});

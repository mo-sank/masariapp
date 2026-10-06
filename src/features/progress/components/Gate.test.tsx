import { fireEvent, render } from '@testing-library/react-native';

import { Text } from '../../../components/ui';
import { ThemeProvider } from '../../../theme/theme-provider';

/**
 * Gate behaviour (requirements 1.3, 1.5).
 *
 * The gate decides what the learner sees for a feature:
 *   - unlocked -> the children,
 *   - locked   -> a LockedState naming the unlocking lesson with a Start lesson
 *                 button that deep-links to it (1.5),
 *   - loading  -> nothing by default (fail closed; no flash of the feature),
 *   - error    -> a retry affordance (never silently expose/hide the feature).
 */

// Imperative navigation for the Start lesson deep link.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
}));

// Drive the gate by controlling the single-feature unlock verdict.
type MockUnlock = {
  unlocked: boolean;
  isLoading: boolean;
  isError: boolean;
  unlockLesson: { id: string; title: string | null };
  refetch: jest.Mock;
};
let mockUnlock: MockUnlock;
jest.mock('../hooks/use-unlock', () => ({
  useUnlock: () => mockUnlock,
}));

// eslint-disable-next-line import/first -- after mocks
import { Gate } from './Gate';

async function renderGate(ui: React.ReactElement) {
  return await render(<ThemeProvider>{ui}</ThemeProvider>);
}

const CHILD = <Text>Portfolio content</Text>;

beforeEach(() => {
  jest.clearAllMocks();
  mockUnlock = {
    unlocked: false,
    isLoading: false,
    isError: false,
    unlockLesson: { id: 'L1.4', title: 'Your First Trade' },
    refetch: jest.fn(),
  };
});

describe('<Gate /> (1.3, 1.5)', () => {
  it('renders children when the feature is unlocked', async () => {
    mockUnlock.unlocked = true;
    const view = await renderGate(<Gate feature="portfolio">{CHILD}</Gate>);
    expect(view.getByText('Portfolio content')).toBeTruthy();
  });

  it('shows a LockedState naming the unlocking lesson when locked (1.5)', async () => {
    const view = await renderGate(<Gate feature="portfolio">{CHILD}</Gate>);
    expect(view.queryByText('Portfolio content')).toBeNull();
    expect(view.getByText('Portfolio is locked')).toBeTruthy();
    expect(
      view.getByText('Complete "Your First Trade" to unlock Portfolio.'),
    ).toBeTruthy();
  });

  it('deep-links to the unlocking lesson from the Start lesson button (1.5)', async () => {
    const view = await renderGate(<Gate feature="portfolio">{CHILD}</Gate>);
    fireEvent.press(view.getByRole('button', { name: 'Start lesson' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: 'L1.4' } });
  });

  it('fails closed while loading: renders no feature and no locked copy by default', async () => {
    mockUnlock.isLoading = true;
    const view = await renderGate(<Gate feature="portfolio">{CHILD}</Gate>);
    expect(view.queryByText('Portfolio content')).toBeNull();
    expect(view.queryByText('Portfolio is locked')).toBeNull();
  });

  it('shows a retry on error and wires it to refetch', async () => {
    mockUnlock.isError = true;
    const view = await renderGate(<Gate feature="portfolio">{CHILD}</Gate>);
    fireEvent.press(view.getByRole('button', { name: 'Try again' }));
    expect(mockUnlock.refetch).toHaveBeenCalledTimes(1);
  });

  it('renders a caller-provided fallback instead of the default LockedState', async () => {
    const view = await renderGate(
      <Gate feature="portfolio" fallback={<Text>Custom locked</Text>}>
        {CHILD}
      </Gate>,
    );
    expect(view.getByText('Custom locked')).toBeTruthy();
    expect(view.queryByText('Portfolio is locked')).toBeNull();
  });

  it('falls back to generic copy when the unlocking lesson has no title', async () => {
    mockUnlock.unlockLesson = { id: 'B1', title: null };
    const view = await renderGate(<Gate feature="daily_briefing">{CHILD}</Gate>);
    expect(
      view.getByText('Complete "the next lesson" to unlock Daily Market Briefing.'),
    ).toBeTruthy();
  });
});

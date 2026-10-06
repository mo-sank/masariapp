import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { TutorialStep } from './steps';
import { ThemeProvider } from '../../theme/theme-provider';

// Control the device "seen" flag the launcher reads.
let mockSeenState = {
  isLoading: false,
  hasSeen: false,
  markSeen: jest.fn().mockResolvedValue(undefined),
};
jest.mock('./use-tutorial-seen', () => ({
  useTutorialSeen: () => mockSeenState,
}));

// Capture the analytics lifecycle events.
const mockTrack = jest.fn();
jest.mock('../../lib/analytics', () => ({ track: (name: string) => mockTrack(name) }));

// eslint-disable-next-line import/first -- mocks above must be hoisted before importing the component
import { FirstRunTour } from './first-run-tour';

const steps: TutorialStep[] = [
  { targetId: 'a', title: 'First', body: 'First tip.' },
  { targetId: 'b', title: 'Second', body: 'Second tip.' },
];

function renderTour() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <FirstRunTour steps={steps} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSeenState = {
    isLoading: false,
    hasSeen: false,
    markSeen: jest.fn().mockResolvedValue(undefined),
  };
});

describe('<FirstRunTour />', () => {
  it('launches the tour and logs tutorial_started when the device has not seen it', async () => {
    const view = await renderTour();
    expect(view.getByText('First')).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledWith('tutorial_started');
  });

  it('does not launch while the seen flag is still loading', async () => {
    mockSeenState = { isLoading: true, hasSeen: false, markSeen: jest.fn() };
    const view = await renderTour();
    expect(view.queryByText('First')).toBeNull();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('does not launch when the device has already seen the tour', async () => {
    mockSeenState = { isLoading: false, hasSeen: true, markSeen: jest.fn() };
    const view = await renderTour();
    expect(view.queryByText('First')).toBeNull();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('marks seen and logs tutorial_completed when finished', async () => {
    const markSeen = jest.fn().mockResolvedValue(undefined);
    mockSeenState = { isLoading: false, hasSeen: false, markSeen };
    const view = await renderTour();
    await press(view.getByLabelText('Next tip')); // -> last step
    await press(view.getByLabelText('Finish tutorial')); // -> done
    expect(mockTrack).toHaveBeenCalledWith('tutorial_completed');
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it('marks seen and logs tutorial_skipped when skipped', async () => {
    const markSeen = jest.fn().mockResolvedValue(undefined);
    mockSeenState = { isLoading: false, hasSeen: false, markSeen };
    const view = await renderTour();
    await press(view.getByLabelText('Skip tutorial'));
    expect(mockTrack).toHaveBeenCalledWith('tutorial_skipped');
    expect(markSeen).toHaveBeenCalledTimes(1);
  });
});

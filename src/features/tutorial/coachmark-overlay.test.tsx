import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CoachmarkOverlay } from './coachmark-overlay';
import type { TutorialStep } from './steps';
import { ThemeProvider } from '../../theme/theme-provider';

const steps: TutorialStep[] = [
  { targetId: 'a', title: 'First', body: 'First tip body.' },
  { targetId: 'b', title: 'Second', body: 'Second tip body.' },
];

// render is async in this RNTL version, so callers await it.
function renderOverlay(onFinish: (o: 'completed' | 'skipped') => void) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <CoachmarkOverlay visible steps={steps} onFinish={onFinish} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

// A press that drives a state update; await it so act() scopes do not overlap.
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

describe('<CoachmarkOverlay />', () => {
  it('shows the first step with Next and Skip controls', async () => {
    const view = await renderOverlay(jest.fn());
    expect(view.getByText('First')).toBeTruthy();
    expect(view.getByText('First tip body.')).toBeTruthy();
    expect(view.getByText('1 of 2')).toBeTruthy();
    expect(view.getByLabelText('Next tip')).toBeTruthy();
    expect(view.getByLabelText('Skip tutorial')).toBeTruthy();
  });

  it('advances to the next step on Next, showing Done on the last step', async () => {
    const view = await renderOverlay(jest.fn());
    await press(view.getByLabelText('Next tip'));
    expect(view.getByText('Second')).toBeTruthy();
    expect(view.getByText('2 of 2')).toBeTruthy();
    // The last step's CTA is Done, and Skip is no longer offered.
    expect(view.getByLabelText('Finish tutorial')).toBeTruthy();
    expect(view.queryByLabelText('Skip tutorial')).toBeNull();
  });

  it('calls onFinish("completed") after Done on the last step', async () => {
    const onFinish = jest.fn();
    const view = await renderOverlay(onFinish);
    await press(view.getByLabelText('Next tip')); // -> step 2
    await press(view.getByLabelText('Finish tutorial')); // -> done
    expect(onFinish).toHaveBeenCalledWith('completed');
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onFinish("skipped") when Skip is pressed', async () => {
    const onFinish = jest.fn();
    const view = await renderOverlay(onFinish);
    await press(view.getByLabelText('Skip tutorial'));
    expect(onFinish).toHaveBeenCalledWith('skipped');
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>
          <CoachmarkOverlay visible={false} steps={steps} onFinish={jest.fn()} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(view.queryByText('First')).toBeNull();
  });
});

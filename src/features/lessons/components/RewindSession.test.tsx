/**
 * Component tests for the Rewind session flow (requirements 7.3, 7.4, 10.1).
 *
 * Drives `RewindSession` with hand-built review items (mcq steps) to cover the
 * walkthrough: each re-answer is graded and reported via `onReview` with the
 * right correctness (7.4), the feedback sheet gates advancing (3.2), the summary
 * shows the reviewed/correct counts and reports `onComplete` (7.3), and the
 * empty state renders when nothing resolved.
 */
import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RewindSession } from './RewindSession';
import { ThemeProvider } from '../../../theme/theme-provider';
import type { ReviewItem } from '../rewind-session';
import type { Step } from '../schema';

// Keep the test off the native haptics engine; the session flow does not depend
// on it firing.
jest.mock('../haptics', () => ({ feedbackHaptic: jest.fn() }));
// Deterministic reduce-motion (snap, no animation) so the progress bar is stable.
jest.mock('../../../theme/use-reduce-motion', () => ({ useReduceMotion: () => true }));

function mcqStep(id: string, correctId = 'a'): Step {
  return {
    id,
    type: 'mcq',
    prompt: `Question ${id}`,
    options: [
      { id: 'a', text: `right-${id}` },
      { id: 'b', text: `wrong-${id}` },
    ],
    correctId,
    explanation: `explanation ${id}`,
    variant: 'standard',
    scored: true,
    concept: 'ownership',
  } as Step;
}

function reviewItem(itemId: string, correctId = 'a'): ReviewItem {
  return { itemId, lessonId: 'L1.1', step: mcqStep(itemId, correctId) };
}

interface RenderedSession {
  view: RenderResult;
  onReview: jest.Mock;
  onComplete: jest.Mock;
  onDone: jest.Mock;
}

async function renderSession(
  items: ReviewItem[],
  handlers: Partial<Pick<RenderedSession, 'onReview' | 'onComplete' | 'onDone'>> = {},
): Promise<RenderedSession> {
  const onReview = handlers.onReview ?? jest.fn();
  const onComplete = handlers.onComplete ?? jest.fn();
  const onDone = handlers.onDone ?? jest.fn();
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <RewindSession items={items} onReview={onReview} onComplete={onComplete} onDone={onDone} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { view, onReview, onComplete, onDone };
}

describe('<RewindSession />', () => {
  it('shows the empty state and routes back when nothing resolved (7.3)', async () => {
    const { view, onDone } = await renderSession([]);
    expect(view.getByText('Nothing to review')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Back to learning'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reports each re-answer via onReview with the graded correctness (7.4)', async () => {
    const { view, onReview } = await renderSession([reviewItem('s1', 'a'), reviewItem('s2', 'a')]);

    // First item: pick the correct option.
    expect(view.getByText('Item 1 of 2')).toBeTruthy();
    fireEvent.press(view.getByText('right-s1'));
    expect(onReview).toHaveBeenCalledWith('s1', true);

    // Advance past the feedback sheet to the next item.
    fireEvent.press(await view.findByLabelText('Continue'));
    expect(await view.findByText('Item 2 of 2')).toBeTruthy();

    // Second item: pick the wrong option.
    fireEvent.press(view.getByText('wrong-s2'));
    expect(onReview).toHaveBeenCalledWith('s2', false);
  });

  it('shows the summary with the correct count and reports onComplete (7.3)', async () => {
    const { view, onComplete } = await renderSession([
      reviewItem('s1', 'a'),
      reviewItem('s2', 'a'),
    ]);

    fireEvent.press(view.getByText('right-s1')); // correct
    fireEvent.press(await view.findByLabelText('Continue'));
    await view.findByText('Item 2 of 2');
    fireEvent.press(view.getByText('wrong-s2')); // wrong
    // Last item advances with "Finish".
    fireEvent.press(await view.findByLabelText('Finish'));

    expect(await view.findByText('Rewind complete')).toBeTruthy();
    expect(view.getByLabelText('You reviewed 2 items and got 1 right')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith({ reviewed: 2, correct: 1 });
  });

  it('returns to learning from the summary (7.3)', async () => {
    const { view, onDone } = await renderSession([reviewItem('s1', 'a')]);

    fireEvent.press(view.getByText('right-s1'));
    fireEvent.press(await view.findByLabelText('Finish'));

    await view.findByText('Rewind complete');
    fireEvent.press(view.getByLabelText('Back to learning'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not advance until the learner dismisses the feedback (3.2)', async () => {
    const { view } = await renderSession([reviewItem('s1', 'a'), reviewItem('s2', 'a')]);

    fireEvent.press(view.getByText('right-s1'));
    // Still on item 1 until Continue is pressed; the feedback sheet is showing.
    expect(view.getByText('Item 1 of 2')).toBeTruthy();
    await waitFor(() => expect(view.getByLabelText('Continue')).toBeTruthy());
  });
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LessonPlayer } from './LessonPlayer';
import { ThemeProvider } from '../../../theme/theme-provider';
import type { Lesson } from '../schema';
import { useSessionStore } from '../store/session';

// Spy on the analytics helpers (10.1) and the haptic (3.4). Mocking the modules
// keeps the test off the native haptics engine and the analytics queue while
// letting us assert the player logs the right lifecycle events.
const mockTrackStepAnswered = jest.fn();
const mockTrackLessonCompleted = jest.fn();
jest.mock('../analytics', () => ({
  trackStepAnswered: (...args: unknown[]) => mockTrackStepAnswered(...args),
  trackLessonCompleted: (...args: unknown[]) => mockTrackLessonCompleted(...args),
  trackLessonStarted: jest.fn(),
}));

const mockFeedbackHaptic = jest.fn();
jest.mock('../haptics', () => ({
  feedbackHaptic: (...args: unknown[]) => mockFeedbackHaptic(...args),
}));

// Force a known reduce-motion value so the progress bar / haptic branches are
// deterministic. Default: motion allowed (false).
let mockReduceMotionValue = true;
jest.mock('../../../theme/use-reduce-motion', () => ({
  useReduceMotion: () => mockReduceMotionValue,
}));

/** A two-step lesson: one scored mcq, then one unscored cards step. */
function makeLesson(): Lesson {
  return {
    id: 'L-test',
    unit: 1,
    order: 1,
    kind: 'lesson',
    title: 'Test lesson',
    bigIdea: 'Testing the player.',
    estimatedMinutes: 3,
    xp: 10,
    passScore: 60,
    prerequisite: null,
    concepts: ['testing'],
    unlocks: [],
    steps: [
      {
        id: 's1',
        type: 'mcq',
        prompt: 'Pick the right one',
        options: [
          { id: 'a', text: 'Right' },
          { id: 'b', text: 'Wrong' },
        ],
        correctId: 'a',
        explanation: 'A is correct because reasons.',
        variant: 'standard',
        scored: true,
        concept: 'testing',
      },
      {
        id: 's2',
        type: 'cards',
        cards: [{ body: 'A closing card.' }],
      },
    ],
  } as Lesson;
}

function renderPlayer(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default reduce-motion ON so the progress bar snaps (no animation timer) in
  // most tests; the one haptic test that needs motion flips this explicitly.
  mockReduceMotionValue = true;
  // Reset the session store to idle, then start a fresh session for the lesson.
  useSessionStore.getState().exit();
});

describe('<LessonPlayer />', () => {
  it('shows a progress bar and the current step one at a time (3.1)', async () => {
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={jest.fn()} />,
    );

    // Progress bar present and announcing step 1 of 2.
    const bar = view.getByTestId('lesson-progress');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 2, now: 1 });

    // First step shown; the second step's content is not yet rendered.
    expect(view.getByText('Pick the right one')).toBeTruthy();
    expect(view.queryByText('A closing card.')).toBeNull();
  });

  it('shows feedback with explanation, logs the answer, and fires a light haptic on a scored answer (3.2, 3.4, 10.1)', async () => {
    mockReduceMotionValue = false;
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={jest.fn()} />,
    );

    // Pick the correct option in the real McqStep ("Right" is correctId 'a').
    fireEvent.press(view.getByText('Right'));

    // Feedback sheet appears with the verdict and the authored explanation (3.2).
    expect(await view.findByText('Correct')).toBeTruthy();
    expect(view.getByText('A is correct because reasons.')).toBeTruthy();

    // step_answered logged with lesson id, step id, correctness (10.1).
    expect(mockTrackStepAnswered).toHaveBeenCalledWith('L-test', 's1', true);
    // Light haptic fired, respecting reduce-motion = false (3.4).
    expect(mockFeedbackHaptic).toHaveBeenCalledWith(true, false);
  });

  it('advances to the next step after the learner continues from feedback', async () => {
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={jest.fn()} />,
    );

    fireEvent.press(view.getByText('Right'));
    // Dismiss the feedback sheet (its Continue button advances to the next step).
    fireEvent.press(await view.findByLabelText('Continue'));

    // Second (cards) step is now shown; first step's prompt is gone.
    expect(await view.findByText('A closing card.')).toBeTruthy();
    expect(view.queryByText('Pick the right one')).toBeNull();
  });

  it('completes the run with the computed score and a duration (5.1, 3.5, 10.1)', async () => {
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);
    const onComplete = jest.fn();

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={onComplete} />,
    );

    // Answer the scored step correctly, then continue past the feedback sheet.
    fireEvent.press(view.getByText('Right'));
    fireEvent.press(await view.findByLabelText('Continue'));

    // The final (unscored) cards step now shows; continue past it to finish.
    await view.findByText('A closing card.');
    fireEvent.press(view.getByLabelText('Continue to the next step'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];
    expect(result.score.scorePct).toBe(100);
    expect(typeof result.durationMs).toBe('number');

    // lesson_completed logged with id, score, duration (10.1, 3.5).
    expect(mockTrackLessonCompleted).toHaveBeenCalledWith('L-test', 100, expect.any(Number));
  });

  it('scores a wrong answer as 0 and surfaces the not-quite verdict', async () => {
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);
    const onComplete = jest.fn();

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={onComplete} />,
    );

    // Pick the wrong option in the real McqStep ("Wrong" is option 'b').
    fireEvent.press(view.getByText('Wrong'));
    expect(await view.findByText('Not quite')).toBeTruthy();
    expect(mockTrackStepAnswered).toHaveBeenCalledWith('L-test', 's1', false);

    fireEvent.press(await view.findByLabelText('Continue'));
    await view.findByText('A closing card.');
    fireEvent.press(view.getByLabelText('Continue to the next step'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0].score.scorePct).toBe(0);
  });

  it('confirms before leaving and clears the session on exit (3.3)', async () => {
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);
    const onExit = jest.fn();

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={onExit} onComplete={jest.fn()} />,
    );

    // Tapping exit does not leave immediately; it asks for confirmation.
    fireEvent.press(view.getByLabelText('Exit the lesson'));
    expect(await view.findByText('Leave this lesson?')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();

    // Keep going dismisses without leaving.
    fireEvent.press(view.getByText('Keep going'));
    await waitFor(() => expect(view.queryByText('Leave this lesson?')).toBeNull());
    expect(onExit).not.toHaveBeenCalled();

    // Confirming leave calls onExit and resets the session store.
    fireEvent.press(view.getByLabelText('Exit the lesson'));
    fireEvent.press(await view.findByLabelText('Leave the lesson'));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(useSessionStore.getState().status).toBe('idle');
    expect(useSessionStore.getState().lessonId).toBeNull();
  });

  it('skips the haptic when reduce-motion is enabled (3.4, 10.1)', async () => {
    mockReduceMotionValue = true;
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={jest.fn()} />,
    );

    fireEvent.press(view.getByText('Right'));
    // The player passes reduceMotion through; the helper is responsible for the
    // no-op, so we assert it was called with the enabled flag.
    await waitFor(() => expect(mockFeedbackHaptic).toHaveBeenCalledWith(true, true));
  });

  it('does not reveal a verdict or explanation for a placement lesson (6.3)', async () => {
    // A placement lesson must not show which answers were right or wrong.
    const lesson = { ...makeLesson(), id: 'L0', kind: 'placement' } as Lesson;
    useSessionStore.getState().start(lesson.id);

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={jest.fn()} />,
    );

    // Answer incorrectly: a scored lesson would show "Not quite" + explanation.
    fireEvent.press(view.getByText('Wrong'));

    // Instead the placement player shows a neutral acknowledgment, no verdict,
    // and never the authored explanation (6.3 no-reveal).
    expect(await view.findByText('Answer saved')).toBeTruthy();
    expect(view.queryByText('Correct')).toBeNull();
    expect(view.queryByText('Not quite')).toBeNull();
    expect(view.queryByText('A is correct because reasons.')).toBeNull();

    // The answer is still recorded for the diagnostic (score computed server-side).
    expect(mockTrackStepAnswered).toHaveBeenCalledWith('L0', 's1', false);
  });

  it('does not render the second step inside the first step card', async () => {
    // Guards the one-step-at-a-time contract against an accidental double render.
    const lesson = makeLesson();
    useSessionStore.getState().start(lesson.id);

    const view = await renderPlayer(
      <LessonPlayer lesson={lesson} onExit={jest.fn()} onComplete={jest.fn()} />,
    );

    // Only the first (mcq) step is on screen; the second step's cards content is
    // not rendered until the learner advances.
    expect(view.getByText('Pick the right one')).toBeTruthy();
    expect(view.queryByText('A closing card.')).toBeNull();
  });
});

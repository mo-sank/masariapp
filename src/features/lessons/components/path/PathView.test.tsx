/**
 * Component tests for the learning path view (requirements 2.1-2.4).
 *
 * Drives `PathView` with hand-built `LearningPath` data (no network) to cover
 * the state matrix the design's testing section calls out ("PathView states"):
 * the Continue card for unfinished work, available/locked/completed nodes,
 * unlock previews, the locked-node block hint and non-tappability, unit grouping
 * and headers, the all-caught-up message, and the empty catalog.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PathView } from './PathView';
import { ThemeProvider } from '../../../../theme/theme-provider';
import { buildLearningPath, type LearningPath } from '../../path';
import type { Lesson } from '../../schema';

/** Minimal lesson factory; only path-relevant fields matter. */
function makeLesson(partial: Partial<Lesson> & Pick<Lesson, 'id'>): Lesson {
  return {
    unit: 1,
    order: 1,
    kind: 'lesson',
    title: partial.id,
    bigIdea: 'idea',
    estimatedMinutes: 3,
    xp: 10,
    passScore: 60,
    prerequisite: null,
    concepts: ['c'],
    unlocks: [],
    steps: [{ id: 's1', type: 'cards', cards: [{ body: 'x' }] }],
    ...partial,
  } as Lesson;
}

async function renderPath(path: LearningPath, onOpenLesson = jest.fn()) {
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <PathView path={path} onOpenLesson={onOpenLesson} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { view, onOpenLesson };
}

/** A three-lesson path: L0 completed, L1.1 available (unlocks explore), L1.2 locked. */
function sampleLessons(): Lesson[] {
  return [
    makeLesson({ id: 'L0', unit: 0, order: 1, kind: 'placement', title: 'Placement', prerequisite: null }),
    makeLesson({
      id: 'L1.1',
      unit: 1,
      order: 1,
      title: 'Slice the Pizza',
      prerequisite: 'L0',
      unlocks: ['explore'],
    }),
    makeLesson({ id: 'L1.2', unit: 1, order: 2, title: 'Auction Day', prerequisite: 'L1.1' }),
  ];
}

describe('<PathView />', () => {
  it('renders a Continue card for the next available lesson (2.4)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view } = await renderPath(path);

    expect(view.getByTestId('continue-card')).toBeTruthy();
    // Continue points at the first available non-completed lesson, L1.1.
    expect(view.getByLabelText('Continue: Slice the Pizza')).toBeTruthy();
  });

  it('calls onOpenLesson with the Continue target when Continue is tapped (2.4)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view, onOpenLesson } = await renderPath(path);

    fireEvent.press(view.getByLabelText('Continue: Slice the Pizza'));
    expect(onOpenLesson).toHaveBeenCalledTimes(1);
    expect(onOpenLesson.mock.calls[0][0].id).toBe('L1.1');
  });

  it('groups lessons by unit with unit headers (2.1)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view } = await renderPath(path);

    expect(view.getByText('UNIT 0')).toBeTruthy();
    expect(view.getByText('UNIT 1')).toBeTruthy();
  });

  it('shows a completed, an available, and a locked node in their states (2.1, 2.2)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view } = await renderPath(path);

    // Completed node (L0) is tappable and labeled completed.
    expect(view.getByLabelText(/Placement, completed/)).toBeTruthy();
    // Available node (L1.1) labeled available.
    expect(view.getByLabelText(/Slice the Pizza, available/)).toBeTruthy();
    // Locked node (L1.2) labeled locked with its block hint.
    expect(view.getByLabelText(/Auction Day, locked, finish Slice the Pizza first/)).toBeTruthy();
    // And the on-screen hint text is present on the locked node.
    expect(view.getByTestId('lesson-node-hint-L1.2').props.children).toBe(
      'Finish Slice the Pizza first',
    );
  });

  it('previews the feature a lesson unlocks (2.3)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view } = await renderPath(path);

    // L1.1 unlocks "explore" -> "Explore" previewed on the node.
    expect(view.getByTestId('lesson-node-unlock-L1.1').props.children).toBe('Unlocks Explore');
  });

  it('opens an available lesson when its node is tapped (2.2)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view, onOpenLesson } = await renderPath(path);

    fireEvent.press(view.getByTestId('lesson-node-L1.1'));
    expect(onOpenLesson).toHaveBeenCalledWith(expect.objectContaining({ id: 'L1.1' }));
  });

  it('does not open a locked lesson when its node is tapped (2.2)', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view, onOpenLesson } = await renderPath(path);

    fireEvent.press(view.getByTestId('lesson-node-L1.2'));
    expect(onOpenLesson).not.toHaveBeenCalled();
  });

  it('allows replaying a completed lesson by tapping its node', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0']));
    const { view, onOpenLesson } = await renderPath(path);

    fireEvent.press(view.getByTestId('lesson-node-L0'));
    expect(onOpenLesson).toHaveBeenCalledWith(expect.objectContaining({ id: 'L0' }));
  });

  it('shows an all-caught-up message and no Continue card when everything is completed', async () => {
    const path = buildLearningPath(sampleLessons(), new Set(['L0', 'L1.1', 'L1.2']));
    const { view } = await renderPath(path);

    expect(view.queryByTestId('continue-card')).toBeNull();
    expect(view.getByText(/all caught up/i)).toBeTruthy();
  });

  it('renders an empty state when there are no lessons', async () => {
    const path = buildLearningPath([], new Set());
    const { view } = await renderPath(path);

    expect(view.queryByTestId('path-view')).toBeNull();
    expect(view.getByText('Lessons are on the way')).toBeTruthy();
  });
});

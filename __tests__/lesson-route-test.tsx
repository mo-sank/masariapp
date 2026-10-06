import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../src/theme/theme-provider';
import type { Lesson } from '../src/features/lessons/schema';
import { useSessionStore } from '../src/features/lessons/store/session';

// --- Mocks ------------------------------------------------------------------

// Route params + imperative navigation.
let mockParams: { id?: string } = { id: 'L1.1' };
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: {
    back: () => mockBack(),
    replace: (href: string) => mockReplace(href),
  },
}));

// Content loader: return a crafted lesson or undefined per test. getLesson is
// also used to resolve a locked lesson's prerequisite title, so look it up in a
// small per-test catalog.
let mockLesson: Lesson | undefined;
let mockCatalog: Record<string, Lesson> = {};
jest.mock('../src/features/lessons/content', () => ({
  getLesson: (id: string) => (id === mockParams.id ? mockLesson : mockCatalog[id]),
}));

// Session + progress: the route guards a lesson on its prerequisite, so it reads
// the signed-in state and the learner's completed lessons. Control both here.
jest.mock('../src/lib/auth0', () => ({
  useSession: () => ({ isSignedIn: true }),
}));
let mockProgress: {
  data: { lesson_id: string; status: string }[];
  isLoading: boolean;
} = { data: [], isLoading: false };
jest.mock('../src/features/lessons/hooks/use-lesson-progress', () => ({
  useLessonProgress: () => mockProgress,
}));

// Analytics: assert lesson_started is logged exactly on a fresh start (10.1).
const mockTrackLessonStarted = jest.fn();
jest.mock('../src/features/lessons/analytics', () => ({
  trackLessonStarted: (...args: unknown[]) => mockTrackLessonStarted(...args),
  trackStepAnswered: jest.fn(),
  trackLessonCompleted: jest.fn(),
}));

// Keep the player off the native haptics engine.
jest.mock('../src/features/lessons/haptics', () => ({ feedbackHaptic: jest.fn() }));

// Completion flow (task 11): stub the mutation, the result hand-off store, and
// the toast so the route's completion wiring loads without the Supabase/Auth0
// clients. These route tests cover session start/resume, not the completion path
// (that is covered by use-complete-lesson / CompletionResults tests).
const mockMutateAsync = jest.fn();
jest.mock('../src/features/lessons/hooks/use-complete-lesson', () => ({
  useCompleteLesson: () => ({ mutateAsync: mockMutateAsync }),
}));
const mockStageOutcome = jest.fn();
jest.mock('../src/features/lessons/completion-result-store', () => ({
  useCompletionResultStore: (selector: (s: unknown) => unknown) =>
    selector({ set: mockStageOutcome, clear: jest.fn(), outcome: null }),
}));

// Placement flow (task 12): stub the assessment mutation and placement hand-off
// store so the route's placement wiring loads without the Supabase/Auth0
// clients. The placement completion path is covered by submit-assessment /
// PlacementResults tests; these route tests cover session start/resume only.
const mockSubmitAssessmentMutateAsync = jest.fn();
jest.mock('../src/features/lessons/hooks/use-submit-assessment', () => ({
  useSubmitAssessment: () => ({ mutateAsync: mockSubmitAssessmentMutateAsync }),
}));
const mockStagePlacement = jest.fn();
jest.mock('../src/features/lessons/placement-result-store', () => ({
  usePlacementResultStore: (selector: (s: unknown) => unknown) =>
    selector({ set: mockStagePlacement, clear: jest.fn(), outcome: null }),
}));
// api/submit-assessment is imported for buildItemResults (a pure helper); it
// also reaches the Supabase client lazily, but importing buildItemResults is
// safe. Provide a lightweight module so the route loads cleanly under Jest.
jest.mock('../src/features/lessons/api/submit-assessment', () => ({
  buildItemResults: (perItem: { stepId: string; concept?: string; correct: boolean }[]) =>
    perItem
      .filter((i) => i.concept != null)
      .map((i) => ({ item_id: i.stepId, concept: i.concept, correct: i.correct })),
}));

// Rewind save flow (task 13): the route builds the run's missed items and fires
// the save mutation. Stub the hook so the route loads without the Supabase/Auth0
// clients (the hook transitively imports the client via use-rewind), and stub
// the pure builder module so the route's import resolves cleanly under Jest. The
// save path itself is covered by save-rewind-items / use-save-rewind-items tests.
const mockSaveRewindMutate = jest.fn();
jest.mock('../src/features/lessons/hooks/use-save-rewind-items', () => ({
  useSaveRewindItems: () => ({ mutate: mockSaveRewindMutate }),
}));
jest.mock('../src/features/lessons/api/save-rewind-items', () => ({
  buildRewindItems: (
    perItem: { stepId: string; correct: boolean }[],
    lessonId: string,
  ) =>
    perItem
      .filter((i) => !i.correct)
      .map((i) => ({ lesson_id: lessonId, item_id: i.stepId })),
}));
const mockToastShow = jest.fn();
jest.mock('../src/components/ui', () => {
  const actual = jest.requireActual('../src/components/ui');
  return { ...actual, useToast: () => ({ show: mockToastShow, hide: jest.fn() }) };
});

// Import after mocks are registered.
import LessonScreen from '../app/lesson/[id]';

function makeLesson(id: string): Lesson {
  return {
    id,
    unit: 1,
    order: 1,
    kind: 'lesson',
    title: 'Routed lesson',
    bigIdea: 'Routing.',
    estimatedMinutes: 3,
    xp: 10,
    passScore: 60,
    prerequisite: null,
    concepts: ['routing'],
    unlocks: [],
    steps: [{ id: 's1', type: 'cards', cards: [{ body: 'Hello from the lesson.' }] }],
  } as Lesson;
}

async function renderScreen() {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <LessonScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'L1.1' };
  mockLesson = makeLesson('L1.1');
  mockCatalog = {};
  mockProgress = { data: [], isLoading: false };
  useSessionStore.getState().exit();
});

describe('<LessonScreen /> route', () => {
  it('shows a lesson-not-found state when the id has no lesson', async () => {
    mockLesson = undefined;
    const view = await renderScreen();

    expect(view.getByText('Lesson not found')).toBeTruthy();
    // No session is started for a missing lesson.
    expect(useSessionStore.getState().status).toBe('idle');
    expect(mockTrackLessonStarted).not.toHaveBeenCalled();
  });

  it('starts a fresh session and logs lesson_started for a known lesson (3.1, 10.1)', async () => {
    const view = await renderScreen();

    // The player renders the lesson's first step.
    expect(view.getByText('Hello from the lesson.')).toBeTruthy();
    // A fresh session is active for this lesson.
    expect(useSessionStore.getState().lessonId).toBe('L1.1');
    expect(useSessionStore.getState().status).toBe('playing');
    // lesson_started logged once (10.1).
    expect(mockTrackLessonStarted).toHaveBeenCalledTimes(1);
    expect(mockTrackLessonStarted).toHaveBeenCalledWith('L1.1');
  });

  it('resumes an in-progress session without re-logging lesson_started (3.3, 10.1)', async () => {
    // Simulate a session already in flight for this lesson, advanced past step 0
    // would require more steps; a single-step lesson still proves the no-reset.
    useSessionStore.getState().start('L1.1');

    await renderScreen();

    // Resuming the same lesson keeps the session and does NOT log a new start.
    expect(useSessionStore.getState().lessonId).toBe('L1.1');
    expect(mockTrackLessonStarted).not.toHaveBeenCalled();
  });

  it('blocks a locked lesson whose prerequisite is not completed and starts no session', async () => {
    // L1.1 requires L0; the learner has completed nothing, so it is locked.
    const locked = makeLesson('L1.1');
    (locked as { prerequisite: string | null }).prerequisite = 'L0';
    mockLesson = locked;
    mockCatalog = { L0: makeLesson('L0') };
    // Name the prerequisite so the locked copy can reference it.
    (mockCatalog.L0 as { title: string }).title = 'Placement Quest';
    mockProgress = { data: [], isLoading: false };

    const view = await renderScreen();

    expect(view.getByText('Lesson locked')).toBeTruthy();
    expect(view.getByText(/Placement Quest/)).toBeTruthy();
    // The player never renders and no session is started for a locked lesson.
    expect(view.queryByText('Hello from the lesson.')).toBeNull();
    expect(useSessionStore.getState().status).toBe('idle');
    expect(mockTrackLessonStarted).not.toHaveBeenCalled();
  });

  it('allows a lesson once its prerequisite is completed', async () => {
    const gated = makeLesson('L1.1');
    (gated as { prerequisite: string | null }).prerequisite = 'L0';
    mockLesson = gated;
    mockCatalog = { L0: makeLesson('L0') };
    // The learner has completed the prerequisite, so the lesson is available.
    mockProgress = { data: [{ lesson_id: 'L0', status: 'completed' }], isLoading: false };

    const view = await renderScreen();

    expect(view.getByText('Hello from the lesson.')).toBeTruthy();
    expect(useSessionStore.getState().status).toBe('playing');
    expect(mockTrackLessonStarted).toHaveBeenCalledWith('L1.1');
  });

  it('shows a loading state (not the player) while progress is still loading', async () => {
    mockProgress = { data: [], isLoading: true };

    const view = await renderScreen();

    // Fail closed: no player, no session, no start event until progress resolves.
    expect(view.queryByText('Hello from the lesson.')).toBeNull();
    expect(useSessionStore.getState().status).toBe('idle');
    expect(mockTrackLessonStarted).not.toHaveBeenCalled();
  });
});

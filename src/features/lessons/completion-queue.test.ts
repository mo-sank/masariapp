import {
  CompletionQueue,
  type CompletionQueueDeps,
  type QueuedCompletion,
} from './completion-queue';
import type { CompleteLessonInput } from './api/complete-lesson';

// Importing the module pulls in its singleton wiring (AsyncStorage, and lazily
// the Supabase client via api/complete-lesson). Mock the native-backed module so
// the file loads under Jest; the tests themselves drive the pure CompletionQueue
// with injected deps and never touch the singleton.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const NOW = 1_700_000_000_000;

/** A sample completion input. */
function input(lessonId = 'L1.1'): CompleteLessonInput {
  return {
    lessonId,
    scorePct: 80,
    durationMs: 123_000,
    answers: [{ stepId: 's1', concept: 'ownership', correct: true }],
  };
}

/** Build a queue with controllable, spyable dependencies. */
function makeQueue(overrides: Partial<CompletionQueueDeps> = {}) {
  const saved: QueuedCompletion[][] = [];
  const sent: CompleteLessonInput[] = [];
  const deps: CompletionQueueDeps = {
    save: jest.fn(async (items) => {
      saved.push(items);
    }),
    load: jest.fn(async () => []),
    send: jest.fn(async (item) => {
      sent.push(item);
    }),
    now: () => NOW,
    ...overrides,
  };
  return { queue: new CompletionQueue(deps), deps, saved, sent };
}

describe('CompletionQueue', () => {
  it('enqueues a completion and persists it', async () => {
    const { queue, deps } = makeQueue();
    await queue.enqueue(input());
    expect(queue.size).toBe(1);
    expect(deps.save).toHaveBeenCalled();
  });

  it('does not enqueue the same completion id twice (no double-submit)', async () => {
    const { queue } = makeQueue();
    await queue.enqueue(input(), 'dup');
    await queue.enqueue(input(), 'dup');
    expect(queue.size).toBe(1);
  });

  it('flushes queued completions and clears them on success', async () => {
    const { queue, sent } = makeQueue();
    await queue.enqueue(input('L1.1'));
    await queue.enqueue(input('L1.2'));
    await queue.flush();
    expect(sent.map((i) => i.lessonId)).toEqual(['L1.1', 'L1.2']);
    expect(queue.size).toBe(0);
  });

  it('retains completions when a send fails, and retries later (never lose)', async () => {
    const send = jest
      .fn<Promise<void>, [CompleteLessonInput]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { queue } = makeQueue({ send });

    await queue.enqueue(input());
    await queue.flush(); // fails -> item stays
    expect(queue.size).toBe(1);

    await queue.flush(); // retries and succeeds
    expect(queue.size).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops at the first failure, keeping that item and the rest queued', async () => {
    const send = jest
      .fn<Promise<void>, [CompleteLessonInput]>()
      .mockResolvedValueOnce(undefined) // first succeeds
      .mockRejectedValueOnce(new Error('offline')); // second fails
    const { queue } = makeQueue({ send });

    await queue.enqueue(input('L1.1'));
    await queue.enqueue(input('L1.2'));
    await queue.flush();

    // The failed item (and anything after) remains for the next attempt.
    expect(queue.size).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('hydrates persisted completions ahead of new ones', async () => {
    const persisted: QueuedCompletion[] = [
      { ...input('old'), id: 'old-1', queuedAt: NOW - 1000 },
    ];
    const { queue, sent } = makeQueue({ load: jest.fn(async () => persisted) });
    await queue.hydrate();
    await queue.enqueue(input('new'), 'new-1');
    await queue.flush();
    expect(sent.map((i) => i.lessonId)).toEqual(['old', 'new']);
  });

  it('does nothing on an empty flush', async () => {
    const { queue, deps } = makeQueue();
    await queue.flush();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('hydrate is idempotent (reads storage only once)', async () => {
    const load = jest.fn(async () => []);
    const { queue } = makeQueue({ load });
    await queue.hydrate();
    await queue.hydrate();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

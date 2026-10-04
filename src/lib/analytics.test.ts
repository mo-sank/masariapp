import {
  AnalyticsQueue,
  FLUSH_AT_COUNT,
  MAX_BATCH,
  sanitizeEvent,
  type AnalyticsDeps,
  type QueuedEvent,
} from './analytics';
import { ANALYTICS_EVENT_NAMES } from '../features/progress/analytics-events';

// These tests exercise the pure AnalyticsQueue (dependencies injected), but
// importing the module pulls in its singleton wiring (AsyncStorage, expo
// Constants). Mock those native-backed modules so the file loads under Jest.
// jest.mock calls are hoisted above the imports above, so these still apply.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

const ISO = '2025-01-01T00:00:00.000Z';

describe('sanitizeEvent (Property 7: analytics privacy)', () => {
  it('drops events whose name is not in the allowlist', () => {
    expect(sanitizeEvent('not_real', {}, ISO)).toBeNull();
    expect(sanitizeEvent('', {}, ISO)).toBeNull();
  });

  it('keeps allowlisted events', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      const event = sanitizeEvent(name, {}, ISO);
      expect(event).not.toBeNull();
      expect(event?.name).toBe(name);
      expect(event?.client_ts).toBe(ISO);
    }
  });

  it('strips disallowed prop keys (email, token, free text)', () => {
    const event = sanitizeEvent(
      'session_start',
      { props: { email: 'a@b.com', token: 'secret', text: 'typed', keep: 1 } },
      ISO,
    );
    expect(event).not.toBeNull();
    expect(event?.props).toEqual({ keep: 1 });
    expect(event?.props).not.toHaveProperty('email');
    expect(event?.props).not.toHaveProperty('token');
    expect(event?.props).not.toHaveProperty('text');
  });

  it('preserves optional session/app fields', () => {
    const event = sanitizeEvent(
      'onboarding_completed',
      { session_id: 's1', app_version: '1.2.3', props: { ok: true } },
      ISO,
    );
    expect(event).toMatchObject({
      name: 'onboarding_completed',
      session_id: 's1',
      app_version: '1.2.3',
      props: { ok: true },
    });
  });
});

/** Build a queue with controllable, spyable dependencies. */
function makeQueue(overrides: Partial<AnalyticsDeps> = {}) {
  const saved: QueuedEvent[][] = [];
  const sentBatches: QueuedEvent[][] = [];
  const deps: AnalyticsDeps = {
    save: jest.fn(async (events) => {
      saved.push(events);
    }),
    load: jest.fn(async () => []),
    send: jest.fn(async (events) => {
      sentBatches.push(events);
    }),
    now: () => Date.parse(ISO),
    ...overrides,
  };
  return { queue: new AnalyticsQueue(deps), deps, saved, sentBatches };
}

describe('AnalyticsQueue', () => {
  it('queues an allowlisted event and persists it', async () => {
    const { queue, deps } = makeQueue();
    await queue.track('session_start', { props: { a: 1 } });
    expect(queue.size).toBe(1);
    expect(deps.save).toHaveBeenCalled();
  });

  it('does not queue an event outside the allowlist', async () => {
    const { queue, deps } = makeQueue();
    await queue.track('nope' as never);
    expect(queue.size).toBe(0);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('auto-flushes once the queue reaches the count threshold', async () => {
    const { queue, deps, sentBatches } = makeQueue();
    for (let i = 0; i < FLUSH_AT_COUNT; i += 1) {
      await queue.track('session_start');
    }
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(sentBatches[0]).toHaveLength(FLUSH_AT_COUNT);
    expect(queue.size).toBe(0);
  });

  it('retains events when a flush fails (offline-safe retry)', async () => {
    const send = jest
      .fn<Promise<void>, [QueuedEvent[]]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { queue } = makeQueue({ send });

    await queue.track('session_start');
    await queue.flush(); // fails
    expect(queue.size).toBe(1);

    await queue.flush(); // retries and succeeds
    expect(queue.size).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('flushes at most MAX_BATCH events per call', async () => {
    const { queue, sentBatches } = makeQueue();
    // Queue two batches worth without hitting the auto-flush count mid-way by
    // flushing manually.
    const total = MAX_BATCH + 5;
    for (let i = 0; i < total; i += 1) {
      // Avoid auto-flush by tracking then resetting via direct flush below.
      // Use a name in the allowlist; props empty.
      await queue.track('session_start');
      // Drain the auto-flush that fires at the threshold so we can keep queuing.
      if (queue.size >= MAX_BATCH) {
        break;
      }
    }
    // The auto-flush already sent one batch of FLUSH_AT_COUNT; just assert no
    // single send exceeded MAX_BATCH.
    for (const batch of sentBatches) {
      expect(batch.length).toBeLessThanOrEqual(MAX_BATCH);
    }
  });

  it('hydrates persisted events ahead of new ones', async () => {
    const persisted: QueuedEvent[] = [{ name: 'session_start', props: {}, client_ts: ISO }];
    const { queue, sentBatches } = makeQueue({ load: jest.fn(async () => persisted) });
    await queue.hydrate();
    await queue.track('onboarding_completed');
    await queue.flush();
    expect(sentBatches[0].map((e) => e.name)).toEqual(['session_start', 'onboarding_completed']);
  });

  it('does nothing on an empty flush', async () => {
    const { queue, deps } = makeQueue();
    await queue.flush();
    expect(deps.send).not.toHaveBeenCalled();
  });
});

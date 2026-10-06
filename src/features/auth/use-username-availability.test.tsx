import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  useUsernameAvailability,
  type AvailabilityStatus,
  type UseUsernameAvailabilityOptions,
} from './use-username-availability';

// `renderHook` is unreliable under this jest-expo setup (see
// src/lib/auth0.test.tsx), so the hook is driven through a throwaway component
// that renders its status kind (and invalid reason) as text the test queries.
// Reading committed output rather than a captured closure keeps the assertions
// robust against this RNTL version's async render.

function Harness({
  username,
  options,
}: {
  username: string;
  options: UseUsernameAvailabilityOptions;
}) {
  const status = useUsernameAvailability(username, options);
  const label =
    status.kind === 'invalid' ? `invalid:${status.reason}` : status.kind;
  return <Text>{`status=${label}`}</Text>;
}

const DEBOUNCE = 400;

function expectStatus(expected: AvailabilityStatus['kind'] | `invalid:${'format' | 'profanity'}`) {
  expect(screen.getByText(`status=${expected}`)).toBeTruthy();
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('useUsernameAvailability', () => {
  it('is idle for empty input and makes no request', async () => {
    const check = jest.fn();
    await render(<Harness username="   " options={{ check }} />);
    expectStatus('idle');
    expect(check).not.toHaveBeenCalled();
  });

  it('reports invalid without hitting the network for a malformed name', async () => {
    const check = jest.fn();
    await render(<Harness username="ab" options={{ check }} />);
    expectStatus('invalid:format');
    expect(check).not.toHaveBeenCalled();
  });

  it('reports invalid (profanity) without hitting the network', async () => {
    const check = jest.fn();
    await render(<Harness username="shithead" options={{ check }} />);
    expectStatus('invalid:profanity');
    expect(check).not.toHaveBeenCalled();
  });

  it('debounces, then reports available for a free valid name', async () => {
    const check = jest.fn().mockResolvedValue(true);
    await render(<Harness username="clever_otter" options={{ check }} />);
    // Before the debounce elapses it is checking and no request has gone out.
    expectStatus('checking');
    expect(check).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE);
    });
    expect(check).toHaveBeenCalledWith('clever_otter');
    expectStatus('available');
  });

  it('reports taken when the checker returns false', async () => {
    const check = jest.fn().mockResolvedValue(false);
    await render(<Harness username="takenname" options={{ check }} />);
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE);
    });
    expectStatus('taken');
  });

  it('reports error when the checker throws', async () => {
    const check = jest.fn().mockRejectedValue(new Error('network'));
    await render(<Harness username="goodname" options={{ check }} />);
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE);
      // Flush the rejected promise's microtasks so the catch handler commits.
      await Promise.resolve();
      await Promise.resolve();
    });
    expectStatus('error');
  });
});

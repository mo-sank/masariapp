import { ANALYTICS_EVENT_NAMES, isAllowedEventName } from './analytics-events';

describe('analytics event allowlist', () => {
  it('includes the two events this spec emits', () => {
    expect(ANALYTICS_EVENT_NAMES).toContain('session_start');
    expect(ANALYTICS_EVENT_NAMES).toContain('onboarding_completed');
  });

  it('has no duplicate names', () => {
    const unique = new Set(ANALYTICS_EVENT_NAMES);
    expect(unique.size).toBe(ANALYTICS_EVENT_NAMES.length);
  });

  it('accepts names in the allowlist', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      expect(isAllowedEventName(name)).toBe(true);
    }
  });

  it('rejects names outside the allowlist', () => {
    expect(isAllowedEventName('not_a_real_event')).toBe(false);
    expect(isAllowedEventName('')).toBe(false);
    // Guard against case / whitespace variants slipping through.
    expect(isAllowedEventName('Session_Start')).toBe(false);
    expect(isAllowedEventName(' session_start ')).toBe(false);
  });
});

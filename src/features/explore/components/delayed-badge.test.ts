import { delayedBadgeLabel, DELAYED_LABEL, EXTENDED_LABEL, LAST_CLOSE_LABEL } from './delayed-badge';

describe('delayedBadgeLabel', () => {
  it('labels the regular session as delayed', () => {
    expect(delayedBadgeLabel('regular', true)).toBe(DELAYED_LABEL);
  });

  it('labels the extended session as after-hours', () => {
    expect(delayedBadgeLabel('extended', false)).toBe(EXTENDED_LABEL);
  });

  it('labels a fully-closed market as last close', () => {
    expect(delayedBadgeLabel('closed', false)).toBe(LAST_CLOSE_LABEL);
  });

  it('falls back to the open flag when no session is given', () => {
    expect(delayedBadgeLabel(undefined, true)).toBe(DELAYED_LABEL);
    expect(delayedBadgeLabel(undefined, false)).toBe(LAST_CLOSE_LABEL);
  });
});

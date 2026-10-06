import {
  USERNAME_BLOCKLIST,
  USERNAME_PATTERN,
  isUsernameAllowed,
  validateUsername,
} from './username-filter';

describe('USERNAME_PATTERN', () => {
  it('accepts letters, digits, underscore and hyphen, 3-20 chars', () => {
    expect(USERNAME_PATTERN.test('abc')).toBe(true);
    expect(USERNAME_PATTERN.test('Cool_Trader-99')).toBe(true);
    expect(USERNAME_PATTERN.test('a'.repeat(20))).toBe(true);
  });

  it('rejects too short, too long, or disallowed characters', () => {
    expect(USERNAME_PATTERN.test('ab')).toBe(false);
    expect(USERNAME_PATTERN.test('a'.repeat(21))).toBe(false);
    expect(USERNAME_PATTERN.test('has space')).toBe(false);
    expect(USERNAME_PATTERN.test('emoji😀name')).toBe(false);
    expect(USERNAME_PATTERN.test('dot.name')).toBe(false);
  });
});

describe('validateUsername', () => {
  it('accepts clean, well-formed names', () => {
    expect(validateUsername('clever_otter')).toEqual({ ok: true });
    expect(validateUsername('investor-123')).toEqual({ ok: true });
    expect(validateUsername('Trader99')).toEqual({ ok: true });
  });

  it('rejects malformed names with reason "format"', () => {
    expect(validateUsername('ab')).toEqual({ ok: false, reason: 'format' });
    expect(validateUsername('a'.repeat(21))).toEqual({ ok: false, reason: 'format' });
    expect(validateUsername('bad name')).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects blocklisted fragments with reason "profanity"', () => {
    // Format is fine here; the blocklist is what trips.
    expect(validateUsername('shithead')).toEqual({ ok: false, reason: 'profanity' });
    expect(validateUsername('a_sex_thing')).toEqual({ ok: false, reason: 'profanity' });
  });

  it('matches the blocklist case-insensitively', () => {
    expect(validateUsername('XxNaZixX')).toEqual({ ok: false, reason: 'profanity' });
  });

  it('prefers the format reason when a name is both malformed and profane', () => {
    // Contains a space (format failure) even though it also embeds a bad word.
    expect(validateUsername('fuck off')).toEqual({ ok: false, reason: 'format' });
  });
});

describe('isUsernameAllowed', () => {
  it('is true only when validateUsername passes', () => {
    expect(isUsernameAllowed('clever_otter')).toBe(true);
    expect(isUsernameAllowed('ab')).toBe(false);
    expect(isUsernameAllowed('shithead')).toBe(false);
  });
});

describe('blocklist hygiene', () => {
  it('has no duplicate entries and only lowercase fragments', () => {
    expect(new Set(USERNAME_BLOCKLIST).size).toBe(USERNAME_BLOCKLIST.length);
    for (const word of USERNAME_BLOCKLIST) {
      expect(word).toBe(word.toLowerCase());
    }
  });
});

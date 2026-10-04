import { parseConfig, type RawEnv } from './config';

const validEnv: RawEnv = {
  auth0Domain: 'masari.us.auth0.com',
  auth0ClientId: 'client-abc123',
  auth0Audience: 'https://api.masari.app',
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-publishable-key',
};

describe('parseConfig', () => {
  it('returns a typed config when every variable is present', () => {
    const config = parseConfig(validEnv);
    expect(config).toEqual({
      auth0Domain: 'masari.us.auth0.com',
      auth0ClientId: 'client-abc123',
      auth0Audience: 'https://api.masari.app',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon-publishable-key',
      // Legal URLs are optional; absent from validEnv so they resolve to the
      // placeholder fallbacks.
      legalPrivacyUrl: 'https://masari.app/legal/privacy',
      legalTermsUrl: 'https://masari.app/legal/terms',
    });
  });

  it('leaves the Sentry DSN undefined when unset (Sentry disabled)', () => {
    const config = parseConfig(validEnv);
    expect(config.sentryDsn).toBeUndefined();
  });

  it('uses a provided Sentry DSN when it is a valid URL', () => {
    const config = parseConfig({
      ...validEnv,
      sentryDsn: 'https://abc@o1.ingest.sentry.io/123',
    });
    expect(config.sentryDsn).toBe('https://abc@o1.ingest.sentry.io/123');
  });

  it('ignores a malformed Sentry DSN (stays disabled rather than crashing)', () => {
    const config = parseConfig({ ...validEnv, sentryDsn: 'not-a-url' });
    expect(config.sentryDsn).toBeUndefined();
  });

  it('falls back to placeholder legal URLs when they are unset', () => {
    const config = parseConfig(validEnv);
    expect(config.legalPrivacyUrl).toBe('https://masari.app/legal/privacy');
    expect(config.legalTermsUrl).toBe('https://masari.app/legal/terms');
  });

  it('uses provided legal URLs when they are set', () => {
    const config = parseConfig({
      ...validEnv,
      legalPrivacyUrl: 'https://example.com/privacy',
      legalTermsUrl: 'https://example.com/terms',
    });
    expect(config.legalPrivacyUrl).toBe('https://example.com/privacy');
    expect(config.legalTermsUrl).toBe('https://example.com/terms');
  });

  it('falls back to the placeholder when a legal URL is malformed', () => {
    const config = parseConfig({ ...validEnv, legalPrivacyUrl: 'not-a-url' });
    expect(config.legalPrivacyUrl).toBe('https://masari.app/legal/privacy');
  });

  it('trims surrounding whitespace from values', () => {
    const config = parseConfig({ ...validEnv, auth0ClientId: '  client-abc123  ' });
    expect(config.auth0ClientId).toBe('client-abc123');
  });

  it('fails fast naming a missing variable', () => {
    const env = { ...validEnv, auth0Domain: undefined };
    expect(() => parseConfig(env)).toThrow(/EXPO_PUBLIC_AUTH0_DOMAIN/);
  });

  it('fails fast naming an empty variable', () => {
    const env = { ...validEnv, supabaseAnonKey: '   ' };
    expect(() => parseConfig(env)).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('names every missing variable at once', () => {
    const env: RawEnv = {
      auth0Domain: undefined,
      auth0ClientId: undefined,
      auth0Audience: undefined,
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
    };
    try {
      parseConfig(env);
      throw new Error('expected parseConfig to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('EXPO_PUBLIC_AUTH0_DOMAIN');
      expect(message).toContain('EXPO_PUBLIC_AUTH0_CLIENT_ID');
      expect(message).toContain('EXPO_PUBLIC_AUTH0_AUDIENCE');
      expect(message).toContain('EXPO_PUBLIC_SUPABASE_URL');
      expect(message).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    }
  });

  it('rejects a malformed Supabase URL by name', () => {
    const env = { ...validEnv, supabaseUrl: 'not-a-url' };
    expect(() => parseConfig(env)).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('never includes a provided secret value in the error message', () => {
    const secret = 'super-secret-anon-key-value';
    // An empty required var alongside a present secret: the thrown error must
    // name the broken variable but never echo any provided value.
    const env = { ...validEnv, supabaseAnonKey: secret, auth0Domain: '' };
    try {
      parseConfig(env);
      throw new Error('expected parseConfig to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });
});

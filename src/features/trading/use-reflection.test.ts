// The hook module imports the Supabase client (which validates env config on
// import); mock it so these pure error-mapping tests load without the real
// client. The mapping itself needs no client.
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { mapReflectionError } from './use-reflection';

describe('mapReflectionError', () => {
  it('maps each known server error code to friendly copy', () => {
    expect(mapReflectionError({ message: 'feature_locked' })).toMatch(/unlocks reflections/i);
    expect(mapReflectionError({ message: 'order_not_found' })).toMatch(/couldn't find that trade/i);
    expect(mapReflectionError({ message: 'reflection_exists' })).toMatch(/already reflected/i);
    expect(mapReflectionError({ message: 'invalid_reflection' })).toMatch(/doesn't look right/i);
    expect(mapReflectionError({ message: 'not_authenticated' })).toMatch(/sign in/i);
  });

  it('trims surrounding whitespace before matching a code', () => {
    expect(mapReflectionError({ message: '  reflection_exists  ' })).toMatch(/already reflected/i);
  });

  it('falls back to generic copy for an unknown code', () => {
    expect(mapReflectionError({ message: 'something_weird' })).toMatch(/couldn't save your reflection/i);
  });

  it('falls back for a non-error value with no message', () => {
    expect(mapReflectionError(null)).toMatch(/couldn't save your reflection/i);
    expect(mapReflectionError('plain string')).toMatch(/couldn't save your reflection/i);
    expect(mapReflectionError({ nope: 1 })).toMatch(/couldn't save your reflection/i);
  });
});

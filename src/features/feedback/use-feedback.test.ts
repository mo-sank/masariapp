// The hook module imports the Supabase client (which validates env config on
// import); mock it so these pure error-mapping tests load without the real
// client. The mapping itself needs no client.
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { mapFeedbackError } from './use-feedback';

describe('mapFeedbackError', () => {
  it('maps each known server error code to friendly copy', () => {
    expect(mapFeedbackError({ message: 'rate_limited' })).toMatch(/try again tomorrow/i);
    expect(mapFeedbackError({ message: 'invalid_category' })).toMatch(/pick a category/i);
    expect(mapFeedbackError({ message: 'message_required' })).toMatch(/add a message/i);
    expect(mapFeedbackError({ message: 'message_too_long' })).toMatch(/bit long/i);
    expect(mapFeedbackError({ message: 'not_authenticated' })).toMatch(/sign in/i);
  });

  it('trims surrounding whitespace before matching a code', () => {
    expect(mapFeedbackError({ message: '  rate_limited  ' })).toMatch(/try again tomorrow/i);
  });

  it('falls back to generic copy for an unknown code', () => {
    expect(mapFeedbackError({ message: 'something_weird' })).toMatch(/couldn't send your feedback/i);
  });

  it('falls back for a non-error value with no message', () => {
    expect(mapFeedbackError(null)).toMatch(/couldn't send your feedback/i);
    expect(mapFeedbackError('plain string')).toMatch(/couldn't send your feedback/i);
    expect(mapFeedbackError({ nope: 1 })).toMatch(/couldn't send your feedback/i);
  });
});

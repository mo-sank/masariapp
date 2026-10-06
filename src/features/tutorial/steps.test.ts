import {
  initTutorial,
  isLastStep,
  tutorialReducer,
  type TutorialState,
} from './steps';

describe('initTutorial', () => {
  it('starts at the first step of a multi-step tour', () => {
    expect(initTutorial(3)).toEqual({ index: 0, total: 3, done: false, outcome: null });
  });

  it('treats a zero-step tour as immediately completed', () => {
    expect(initTutorial(0)).toEqual({ index: 0, total: 0, done: true, outcome: 'completed' });
  });
});

describe('isLastStep', () => {
  it('is true only on the final running step', () => {
    expect(isLastStep({ index: 2, total: 3, done: false, outcome: null })).toBe(true);
    expect(isLastStep({ index: 1, total: 3, done: false, outcome: null })).toBe(false);
  });

  it('is false once the tour is done', () => {
    expect(isLastStep({ index: 3, total: 3, done: true, outcome: 'completed' })).toBe(false);
  });
});

describe('tutorialReducer', () => {
  it('next advances through the middle steps', () => {
    const s0 = initTutorial(3);
    const s1 = tutorialReducer(s0, { type: 'next' });
    expect(s1).toEqual({ index: 1, total: 3, done: false, outcome: null });
    const s2 = tutorialReducer(s1, { type: 'next' });
    expect(s2).toEqual({ index: 2, total: 3, done: false, outcome: null });
  });

  it('next on the last step completes the tour', () => {
    const last: TutorialState = { index: 2, total: 3, done: false, outcome: null };
    expect(tutorialReducer(last, { type: 'next' })).toEqual({
      index: 3,
      total: 3,
      done: true,
      outcome: 'completed',
    });
  });

  it('skip ends the tour immediately with the skipped outcome', () => {
    const mid: TutorialState = { index: 1, total: 3, done: false, outcome: null };
    expect(tutorialReducer(mid, { type: 'skip' })).toEqual({
      index: 3,
      total: 3,
      done: true,
      outcome: 'skipped',
    });
  });

  it('is idempotent once done (further actions are no-ops)', () => {
    const done: TutorialState = { index: 3, total: 3, done: true, outcome: 'completed' };
    expect(tutorialReducer(done, { type: 'next' })).toBe(done);
    expect(tutorialReducer(done, { type: 'skip' })).toBe(done);
  });
});

import { useOnboardingStore } from './onboarding-store';

// Reset the shared store between tests since Zustand stores are module-level
// singletons.
beforeEach(() => {
  useOnboardingStore.getState().reset();
});

describe('onboarding store', () => {
  it('starts empty', () => {
    const state = useOnboardingStore.getState();
    expect(state.birthMonth).toBeNull();
    expect(state.birthYear).toBeNull();
  });

  it('records the birth month and year in memory', () => {
    useOnboardingStore.getState().setBirthDate(6, 2008);
    const state = useOnboardingStore.getState();
    expect(state.birthMonth).toBe(6);
    expect(state.birthYear).toBe(2008);
  });

  it('clears the birth date on reset', () => {
    useOnboardingStore.getState().setBirthDate(3, 2007);
    useOnboardingStore.getState().reset();
    const state = useOnboardingStore.getState();
    expect(state.birthMonth).toBeNull();
    expect(state.birthYear).toBeNull();
  });
});

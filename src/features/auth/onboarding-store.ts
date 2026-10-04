/**
 * In-memory onboarding store (requirement 2.3).
 *
 * When the age gate clears a 13-or-older user, their birth month and year are
 * kept ONLY in memory so onboarding can later pass them to `create_profile`.
 * This is a plain Zustand store with no persistence middleware: the values live
 * for the life of the running app and vanish on reload, so the birth date is
 * never written to disk, logs, or any device storage (contrast with the
 * under-13 device flag, which is the only thing allowed to persist).
 */
import { create } from 'zustand';

export interface OnboardingState {
  /** 1-based birth month (1-12), or null before the age gate is completed. */
  birthMonth: number | null;
  /** Four-digit birth year, or null before the age gate is completed. */
  birthYear: number | null;
  /** Record the birth month/year collected at the age gate (in memory only). */
  setBirthDate: (month: number, year: number) => void;
  /** Drop the in-memory birth date (e.g. on logout or after onboarding). */
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  birthMonth: null,
  birthYear: null,
  setBirthDate: (month, year) => set({ birthMonth: month, birthYear: year }),
  reset: () => set({ birthMonth: null, birthYear: null }),
}));

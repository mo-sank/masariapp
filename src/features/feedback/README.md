# features/feedback

In-app feedback (requirements 5.1-5.3).

- `feedback-logic.ts` — the framework-free pieces: the four categories and their
  labels, the 1000-char message cap, and `isFeedbackSubmittable`.
- `use-feedback.ts` — `useSubmitFeedback`, the mutation over the
  `submit_feedback` RPC, plus `mapFeedbackError` which turns the RPC's stable
  error codes (including the per-day `rate_limited` limit) into friendly copy.

The screen lives at `app/settings/feedback.tsx`. All writes go through the
SECURITY DEFINER RPC; feedback is private to its author (RLS own-rows).

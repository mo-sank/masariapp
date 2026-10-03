```
# Implementation Plan: Foundation, Auth, and Data
```

```
- [ ] 1. Scaffold the Expo app
  - Create Expo TypeScript app with Expo Router; enable TypeScript strict mode
  - Add ESLint, Prettier, Jest + React Native Testing Library; add npm scripts (start, lint, typecheck, test, validate:content)
  - Create the folder layout from structure.md with placeholder README files
  - _Requirements: 1.1_
```

```
- [ ] 2. Configuration and build profiles
  - Add src/lib/config.ts (Zod env validation) and .env.example listing variable NAMES only
  - Add app.config.ts, eas.json with development, preview, production profiles; set bundle identifier and Android package placeholders
  - Create an iOS development build and confirm it launches
  - _Requirements: 1.2, 1.3_
```

```
- [ ] 3. Local Supabase and baseline migration
  - Initialize supabase/, config.toml; `supabase start`
  - Write migrations for sections 3.1, 3.2, 3.4 (core tables only for now), 3.6 and seed app_config
  - Generate types to src/types/db.ts
  - _Requirements: 6.1_
```

```
- [ ] 4. Row-level security, grants, and pgTAP tests
  - Add RLS policies, revokes, and grants exactly as section 4 of the DB reference
  - Write pgTAP tests: cross-user isolation, anon denied, direct writes denied, events not selectable
  - _Requirements: 6.2, 6.3, 6.4, 6.5_
```

```
- [ ] 5. Auth0 SDK integration
  - Install react-native-auth0 with its Expo config plugin; configure domain and clientId from config
  - Implement src/lib/auth0.ts (AuthProvider, useSession) with login, logout, getAccessToken
  - Rebuild the development build (config plugin changes need a prebuild)
  - _Requirements: 3.1, 3.2, 3.3, 3.5_
```

```
- [ ] 6. Age gate
  - Implement computeAge and unit tests (month boundaries, last-day-of-month rule, leap years)
  - Build age-gate and age-block screens, device flag, onboarding in-memory store
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
```

```
- [ ] 7. SPIKE: Auth0 to Supabase token bridge
  - Add a throwaway debug screen that logs in, decodes the token the app sends (not displayed in release builds), and calls `select public.current_user_id()` via rpc or a test function
  - Confirm role = "authenticated" and sub are present; if not, adjust the Auth0 Action and token choice
  - Record the decision in tech.md; delete the debug screen
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
```

```
- [ ] 8. Supabase client, providers, and AuthGate
  - Implement src/lib/supabase.ts with accessToken callback; add QueryClientProvider and ThemeProvider
  - Implement AuthGate routing (age block, welcome, onboarding, tabs)
  - Clear Query cache and stores on logout
  - _Requirements: 3.4, 3.5, 4.1_
```

```
- [ ] 9. create_profile RPC and onboarding UI
  - Add migration for create_profile (section 5.1) and grants; pgTAP tests (under 13 rejected, idempotent, creates account/stats/consents, username rules)
  - Implement username generator with reviewed word lists and unit tests
  - Build onboarding screen (shuffle username, terms checkbox, continue) and error handling for username_taken and under_min_age
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
```

```
- [ ] 10. Theme, UI kit, and app shell
  - Implement theme tokens (light/dark) and base components (Button, Card, Text, Screen, StateView, LockedState, Toast)
  - Build the four-tab shell with locked/empty states
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
```

```
- [ ] 11. Settings and account deletion
  - Build settings screens, legal links (placeholder URLs from config), delete-account confirmation UI
  - Implement the delete-account Edge Function (JWT check with jose, cascade delete, Auth0 Management API delete); set verify_jwt = false in config.toml
  - Test against the dev project with a throwaway account
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
```

```
- [ ] 12. Observability and analytics plumbing
  - Add Sentry with sendDefaultPii false and scrubbing; add an error boundary
  - Add log_events RPC (event-name allowlist) with pgTAP tests; implement src/lib/analytics.ts queue and flush
  - Log session_start and onboarding_completed
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
```

```
- [ ] 13. Accessibility pass
  - Add labels/roles, test with larger text and VoiceOver, support reduce-motion, check contrast
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
```

```
- [ ] 14. Continuous integration
  - Add GitHub Actions: install, lint, typecheck, unit tests, `supabase start` + `supabase test db`
  - _Requirements: 1.4_
```

```
- [ ] 15. Checkpoint
  - Run the full manual device test (signup, onboarding, tabs, logout, login, delete account); fix defects; update steering files with any decisions made
```
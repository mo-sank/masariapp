Masari Spec 1: Foundation, Auth0, and Data

_Folder in repo: .kiro/specs/foundation-auth-data/. Create the three files below, then open the spec in Kiro. Build this spec FIRST. Everything else depends on it._

# What this spec delivers

A running Expo app with: age gate, Auth0 login, Supabase connected through Auth0 tokens, onboarding that creates a profile and paper account, a tabbed app shell, settings with account deletion, error tracking, first-party analytics plumbing, and a database with row-level security proven by tests.

**Outside Kiro first (see the Setup Guide):** create the Auth0 tenant/app/API/Action, the Supabase dev project, and the Sentry project. Kiro cannot do these for you.

# File: .kiro/specs/foundation-auth-data/requirements.md

```
# Requirements Document: Foundation, Auth, and Data
```

```
## Introduction
This spec creates the technical foundation of Masari: the Expo app scaffold, Auth0 authentication, the Supabase connection with row-level security, onboarding, the app shell, and baseline observability. It follows the rules in .kiro/steering/*.md and the schema in docs/db-and-api-reference.md.
```

```
## Requirements
```

```
### Requirement 1: Project scaffold and environments
**User Story:** As the developer, I want a typed, linted, tested project with dev/preview/production builds, so that every later feature starts from a stable base.
```

```
#### Acceptance Criteria
1. WHEN the repo is cloned and `npm install` is run THEN the system SHALL install without errors and `npm run typecheck`, `npm run lint`, and `npm test` SHALL pass.
2. WHEN a development build is created with EAS THEN the app SHALL launch on an iOS simulator or device (Expo Go is not supported).
3. WHEN environment variables are missing THEN the app SHALL fail fast at startup with a readable error naming the missing variable (never printing secret values).
4. WHEN a pull request is opened THEN the CI workflow SHALL run lint, typecheck, unit tests, and database tests.
```

```
### Requirement 2: Age gate
**User Story:** As a parent or school stakeholder, I want users under 13 blocked before any account is created, so that the app respects minimum-age rules.
```

```
#### Acceptance Criteria
1. WHEN an unauthenticated user opens the app THEN the system SHALL show an age screen asking for birth month and year before showing any login option.
2. WHEN the computed age is under 13 THEN the system SHALL show a friendly blocking message, SHALL NOT start Auth0 login, SHALL NOT store the birth date, and SHALL set a device-local flag that keeps the block in place.
3. WHEN the computed age is 13 or older THEN the system SHALL continue to Auth0 login and keep the birth month and year only in memory for onboarding.
4. WHEN age is computed THEN the system SHALL use the last day of the birth month so borderline users are treated as younger.
```

```
### Requirement 3: Sign up, login, logout (Auth0)
**User Story:** As a teen, I want to sign up and log in with my email, so that my progress is saved.
```

```
#### Acceptance Criteria
1. WHEN the user taps "Get started" or "Log in" THEN the system SHALL open Auth0 Universal Login using react-native-auth0.
2. WHEN login succeeds THEN the system SHALL store credentials through the Auth0 SDK only, and SHALL NOT write tokens to AsyncStorage or logs.
3. WHEN the access token expires THEN the system SHALL refresh it silently, and IF refresh fails THEN the system SHALL return the user to the welcome screen with a clear message.
4. WHEN the user taps "Log out" THEN the system SHALL clear the Auth0 session, the TanStack Query cache, and local stores.
5. WHEN the user closes and reopens the app while signed in THEN the system SHALL restore the session without a new login.
6. WHEN an email is unverified THEN the system SHALL rely on Auth0's verification flow and SHALL NOT let the user past Universal Login until verified.
```

```
### Requirement 4: Supabase connection through Auth0
**User Story:** As the developer, I want Supabase to trust Auth0 tokens, so that row-level security works per user.
```

```
#### Acceptance Criteria
1. WHEN the Supabase client makes a request THEN the system SHALL send the current Auth0 token via the client's accessToken callback.
2. WHEN the token reaches Supabase THEN the JWT SHALL contain `sub` and `role = "authenticated"` (added by the Auth0 Action).
3. WHEN the SQL `select public.current_user_id()` is run through the client THEN it SHALL return the caller's Auth0 `sub`.
4. WHEN a request is made without a token THEN the system SHALL read no user data.
```

```
### Requirement 5: Onboarding and profile creation
**User Story:** As a new user, I want a fun username and to accept the terms, so that I can start learning without sharing personal details.
```

```
#### Acceptance Criteria
1. WHEN a signed-in user has no profile THEN the system SHALL show onboarding before the main app.
2. WHEN onboarding opens THEN the system SHALL offer a generated adjective-animal-number username and a "shuffle" button, with NO free-text entry.
3. WHEN the user accepts the current Terms and Privacy versions and confirms THEN the system SHALL call `create_profile` with username, birth year and month, device timezone, and version strings.
4. WHEN `create_profile` succeeds THEN the database SHALL have a profile, two consent rows, a paper account with starting cash, and a user_stats row.
5. WHEN `create_profile` returns `username_taken` THEN the system SHALL generate a new username and retry once, then show a friendly error.
6. WHEN `create_profile` returns `under_min_age` THEN the system SHALL show the age-block message and log the user out.
7. WHEN `create_profile` is called twice for the same user THEN the system SHALL return the existing profile without duplicates.
```

```
### Requirement 6: Database baseline and row-level security
**User Story:** As a parent and as the developer, I want each teen's data private, so that no one can read or change another user's information.
```

```
#### Acceptance Criteria
1. WHEN migrations are applied THEN every table in docs/db-and-api-reference.md SHALL exist with RLS enabled.
2. WHEN user A queries any user-owned table THEN the system SHALL return only user A's rows.
3. WHEN any client tries to INSERT, UPDATE, or DELETE directly on any table THEN the system SHALL reject it.
4. WHEN the anon role queries any table THEN the system SHALL return nothing or an error.
5. WHEN `supabase test db` runs THEN pgTAP tests covering criteria 2 to 4 SHALL pass.
```

```
### Requirement 7: App shell and navigation
**User Story:** As a user, I want a clear home with Learn, Explore, Portfolio, and Profile tabs, so that I always know where I am.
```

```
#### Acceptance Criteria
1. WHEN the user is signed in with a profile THEN the system SHALL show four tabs: Learn, Explore, Portfolio, Profile.
2. WHEN a feature is not yet unlocked THEN its tab content SHALL show a friendly locked state naming the lesson that unlocks it.
3. WHEN a screen is loading, empty, offline, or in error THEN the system SHALL show a consistent state component, never a blank screen.
4. WHEN the theme is built THEN colors, spacing, and typography SHALL come from tokens in src/theme, supporting light and dark mode.
```

```
### Requirement 8: Settings, legal, and account deletion
**User Story:** As a user or parent, I want to see the legal documents and delete my account, so that I stay in control of my data.
```

```
#### Acceptance Criteria
1. WHEN the user opens Settings THEN the system SHALL show Privacy Policy, Terms, Send feedback (placeholder), Log out, and Delete account.
2. WHEN the user chooses Delete account THEN the system SHALL require an explicit confirmation step explaining that deletion is permanent.
3. WHEN deletion is confirmed THEN the delete-account Edge Function SHALL verify the Auth0 token, delete the user's profile (cascading all their data), delete the Auth0 user via the Management API, and the app SHALL sign out and return to the age screen.
4. WHEN deletion fails partway THEN the system SHALL show an error and SHALL be safe to retry.
```

```
### Requirement 9: Observability and analytics plumbing
**User Story:** As the team, I want crash reports and basic event logging that respect teen privacy, so that we can improve the app safely.
```

```
#### Acceptance Criteria
1. WHEN an unhandled error occurs THEN Sentry SHALL capture it with sendDefaultPii disabled and emails and ids scrubbed.
2. WHEN the app logs an analytics event THEN the system SHALL queue it locally and flush batches to the log_events RPC, retrying when offline.
3. WHEN the app starts, a session begins, or onboarding completes THEN the system SHALL log session_start and onboarding_completed events.
4. WHEN events are written THEN no email, token, or free text SHALL be included in props.
```

```
### Requirement 10: Accessibility and quality baseline
**User Story:** As a user with different needs, I want the app to work with larger text and screen readers.
```

```
#### Acceptance Criteria
1. WHEN dynamic type is increased THEN layouts SHALL remain usable without clipped text.
2. WHEN a screen reader is on THEN every interactive element SHALL have an accessibility label and role.
3. WHEN reduce-motion is enabled THEN non-essential animations SHALL be skipped.
4. WHEN colors are chosen THEN text and controls SHALL meet WCAG AA contrast.
```

# File: .kiro/specs/foundation-auth-data/design.md

```
# Design Document: Foundation, Auth, and Data
```

```
## Overview
An Expo (TypeScript) app using Expo Router. Auth0 handles identity. Supabase stores data and enforces RLS using the Auth0 `sub`. All writes go through RPCs. This design implements requirements 1 to 10.
```

```
## Architecture
App (Expo Router screens) -> feature hooks -> src/lib/auth0.ts (Auth0 SDK) and src/lib/supabase.ts (Supabase client with accessToken callback) -> Supabase Postgres (RLS + RPCs). Edge Function delete-account -> Auth0 Management API.
```

```
### Startup and routing flow
1. App loads config (validated with Zod). Sentry initializes.
2. Root layout wraps: Auth0Provider -> QueryClientProvider -> ThemeProvider -> AuthGate.
3. AuthGate decides the route:
   - Under-13 device flag set -> /age-block
   - No Auth0 session -> /(auth)/age-gate (then /(auth)/welcome)
   - Session but no profile (select from profiles returns none) -> /(auth)/onboarding
   - Session and profile -> /(tabs)/learn
```

```
### Auth flow (sequence)
1. Age gate collects month+year, computes age (last day of birth month). Under 13: block. Otherwise keep month/year in memory (onboarding store).
2. Welcome screen: "Get started" / "Log in" -> auth0.authorize() (Universal Login, audience = AUTH0_AUDIENCE, scope = "openid profile email offline_access").
3. useAuth0().getCredentials() returns tokens. The Supabase client's accessToken callback calls getCredentials() each time and returns the token that carries the role claim.
4. Auth0 Post-Login Action sets role = "authenticated" so Supabase assigns the authenticated Postgres role.
5. RLS reads the user id with public.current_user_id() (auth.jwt() ->> 'sub').
```

```
**Token note:** Supabase's current Auth0 guide and Auth0's claim handling differ on whether the claim survives in the access token or only the ID token. The spike task decodes the token the app actually sends. Use whichever token contains role = "authenticated" and sub, and record the decision in tech.md.
```

```
## Components and interfaces
```

```
### src/lib/config.ts
Zod-validated env: auth0Domain, auth0ClientId, auth0Audience, supabaseUrl, supabaseAnonKey. Throws a readable error naming missing keys.
```

```
### src/lib/auth0.ts
Thin wrapper exporting: AuthProvider (Auth0Provider), useSession() -> { isLoading, isSignedIn, login(), logout(), getAccessToken() }.
```

```
### src/lib/supabase.ts
createClient(url, anonKey, { accessToken: async () => await getAccessToken() }). Exports a singleton. No other file constructs a client.
```

```
### src/features/auth
- age.ts: computeAge(month, year, now) using last day of month; isUnderMin(age). Pure + tested.
- use-age-block.ts: reads/writes the device flag (AsyncStorage key under13_blocked; contains no personal data).
- onboarding-store.ts (Zustand): birthMonth, birthYear (in memory only).
- username.ts: generateUsername(rng) from adjective/animal word lists, format ^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$. Word lists reviewed for appropriateness.
- api/create-profile.ts: calls rpc('create_profile'), maps error codes to typed errors.
- screens: age-gate, age-block, welcome, onboarding (username + terms checkbox + continue).
```

```
### src/features/settings
- Screens: settings index, legal webviews (Privacy, Terms), delete-account confirm.
- api/delete-account.ts: POST to /functions/v1/delete-account with the Auth0 token.
```

```
### src/components/ui
Button, Card, Text, Screen, Sheet, StateView (loading/empty/error/offline), LockedState, Toast. All support dynamic type and accessibility labels.
```

```
### src/lib/analytics.ts
track(name, props) -> in-memory queue persisted to AsyncStorage; flush every 20 events or 30 s and on app background via rpc('log_events'). Drops events if props contain disallowed keys (email, token, text).
```

```
### Edge Function: delete-account
1. Read Authorization bearer. Verify with jose against the Auth0 JWKS (issuer, audience).
2. sub = payload.sub. Using the service-role client: delete from profiles where user_id = sub.
3. Get a Management API token (client-credentials) and DELETE /api/v2/users/{sub}.
4. Return 204. Idempotent: if the profile is already gone, still attempt the Auth0 delete.
```

```
## Data models
Tables used here: app_config, profiles, consents, paper_accounts, user_stats, events (full DDL in docs/db-and-api-reference.md sections 3.1, 3.2, 3.4, 3.6). RPCs: create_profile, log_events.
```

```
## Error handling
- Map RPC error messages to typed AppError codes (see trading-and-data-rules.md) and friendly copy.
- Network failure: show StateView offline with retry; never lose queued analytics.
- Auth failure: return to welcome with a message; never leave a spinner.
- Config failure: dev-only error screen.
```

```
## Testing strategy
- Unit: computeAge (edge cases: month boundaries, leap years), generateUsername format, error mapping, analytics queue.
- Component: age gate, onboarding, StateView, LockedState.
- Database (pgTAP): RLS isolation per table; direct writes denied; anon denied; create_profile (age under 13 rejected, idempotent, creates account + stats + consents, username validation).
- Manual device test: full signup -> onboarding -> tabs -> logout -> login -> delete account.
```

# File: .kiro/specs/foundation-auth-data/tasks.md

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
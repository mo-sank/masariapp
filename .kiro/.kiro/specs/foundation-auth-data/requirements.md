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
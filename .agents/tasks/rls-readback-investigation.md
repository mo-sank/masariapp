# RLS Read-Back Investigation — Masari profiles

READ-ONLY investigation. No schema, policy, data, or app code was changed. All
remote queries below were run against the linked Supabase project
`fmjnijwyzkzpksweemkj` via `npx supabase db query --linked` (CLI 2.119.0).

## Summary answer

The database is behaving correctly. The RLS policy, the grants, and
`current_user_id()` on the live project are all correct, and a plain
`authenticated` SELECT returns the profile row whenever the request's JWT `sub`
matches the stored `profiles.user_id` (proven below by simulating the exact RLS
path).

The real cause of the stuck onboarding spinner is on the **identity** side, not
the database:

- Each onboarding attempt was authenticated as a **different Auth0 user**. The
  five profiles in the table have five distinct `auth0|…` subs, created over ~39
  minutes, one per username the user tried.
- `create_profile` and `log_events` are `SECURITY DEFINER` functions. They run
  as the function owner and **bypass RLS**; they only read `current_user_id()`
  to stamp `user_id`. That is why the RPC always "succeeds" (185 ms) and returns
  a row, and why analytics events are written — neither is gated by the SELECT
  policy.
- `fetchMyProfile` (`src/features/auth/use-profile.ts`) is a plain
  `supabase.from('profiles').select(...)`. It runs as the `authenticated` role
  and **is** gated by RLS: `user_id = (select public.current_user_id())`. It
  returns the row only if the JWT `sub` on that request equals the `user_id`
  that was stored. When the stored sub and the read-time sub differ (or the
  read-time request carries no usable sub), the SELECT returns zero rows,
  `hasProfile=false`, and `AuthGate` keeps the user on `/onboarding` forever.

Most likely root cause (ranked in the Conclusions section): the Auth0 session's
`sub` is **not stable across attempts** — Universal Login is minting a new
Database-connection user each time rather than signing the user back into their
existing account — so the profile created under sub A is never readable by a
later session carrying sub B.

## Evidence

### 1. Stored profiles — five distinct subs, one per attempted username

Query: `select user_id, username, created_at from public.profiles order by created_at desc limit 20;`

| user_id | username | created_at |
|---|---|---|
| `auth0\|6ac296595d712d2d2a345fba` | swift-turtle-5386 | 2026-10-04 18:09:35.629+00 |
| `auth0\|6ac29545d33d814958287935` | cosmic-gecko-6781 | 2026-10-04 18:05:00.657+00 |
| `auth0\|6ac293c59ba8663d62971310` | gentle-walrus-4665 | 2026-10-04 17:58:38.313+00 |
| `auth0\|6ac28e4a2016dcf67abd0877` | noble-badger-5185 | 2026-10-04 17:35:16.800+00 |
| `auth0\|6ac28d395d712d2d2a34594a` | merry-wombat-6572 | 2026-10-04 17:30:40.070+00 |

`select count(*) total, count(distinct user_id) distinct_users …` → **5 total,
5 distinct**. The subs are 24-char hex (Auth0 Database/`auth0|` connection user
ids). Every username the user mentioned maps to its own freshly-created user id.
This is the single strongest signal: the identities are not being reused.

The two subs the user saw in live logs line up with this table:
- message 11 `cosmic-gecko-6781` → `auth0|6ac29545d33d814958287935`
- message 12 `swift-turtle-5386` → `auth0|6ac296595d712d2d2a345fba`

The reported ID-token lengths also differ across sessions (len 1163 in the
`jolly-badger` session vs len 1171 in the `cosmic`/`swift` sessions), consistent
with different identities / claim sets rather than one stable user.

### 2. Each sub is a complete, self-consistent account

Query joining companion tables per sub:

| user_id | username | consents | paper | stats |
|---|---|---|---|---|
| …345fba | swift-turtle-5386 | 2 | 1 | 1 |
| …287935 | cosmic-gecko-6781 | 2 | 1 | 1 |
| …971310 | gentle-walrus-4665 | 2 | 1 | 1 |
| …bd0877 | noble-badger-5185 | 2 | 1 | 1 |
| …34594a | merry-wombat-6572 | 2 | 1 | 1 |

Every `create_profile` call ran to completion under its own identity (2 consent
rows + 1 paper account + 1 user_stats, exactly what the RPC seeds). These are
five separate users, not duplicate rows for one user.

### 3. The live RLS policy and grants are correct

`pg_policy` on `public.profiles`:

| polname | polcmd | using_expr | role |
|---|---|---|---|
| own rows | r (SELECT) | `(user_id = (SELECT current_user_id() AS current_user_id))` | authenticated |

`information_schema.role_table_grants` for `public.profiles`: `authenticated`
has **SELECT** (and `postgres`/`service_role` have full DML). No stray
INSERT/UPDATE for `authenticated`.

RLS is enabled on all owned tables (`pg_class.relrowsecurity = true` for
profiles, consents, paper_accounts, user_stats).

Live `current_user_id()` definition matches the migration verbatim:
`select nullif(auth.jwt() ->> 'sub', '')` (LANGUAGE sql, STABLE).

→ Hypotheses **3 (grant/revoke ordering)** and **4 (policy predicate mismatch)**
are ruled out. The grant exists and the predicate is exactly right.

### 4. The RLS SELECT path works when sub matches — proven directly

Simulating `current_user_id()` from request claims:
```
select set_config('request.jwt.claims',
  '{"sub":"auth0|6ac296595d712d2d2a345fba","role":"authenticated"}', true);
select public.current_user_id();   -- → auth0|6ac296595d712d2d2a345fba
```

Simulating the full authenticated SELECT under RLS (matching sub):
```
set local role authenticated;
set local request.jwt.claims = '{"sub":"auth0|6ac296595d712d2d2a345fba","role":"authenticated"}';
select user_id, username from public.profiles;
-- → 1 row: auth0|6ac296595d712d2d2a345fba / swift-turtle-5386
```

Non-matching sub, and missing sub, both return **0 rows** (the app's exact
symptom):
```
set local role authenticated;
set local request.jwt.claims = '{"sub":"auth0|DIFFERENTuser…","role":"authenticated"}';
select count(*) from public.profiles;              -- → 0

set local request.jwt.claims = '{"role":"authenticated"}';  -- no sub
select count(*) from public.profiles;              -- → 0
```

This is the crux: the DB returns the row iff the read-time `sub` equals the
stored `user_id`. The app seeing `hasProfile=false` therefore means the SELECT
request carried a sub that does not match the row just written (or carried no
usable sub).

### 5. Why the RPC "succeeds" but the SELECT does not — the SECURITY DEFINER asymmetry

- `supabase/migrations/20250103000007_create_profile_rpc.sql`: `create_profile`
  is `security definer`. It inserts `user_id = current_user_id()` and returns
  the row **without ever being checked against the SELECT policy** (definer
  bypasses RLS).
- `supabase/migrations/20250103000008_log_events_rpc.sql`: `log_events` is also
  `security definer`; it writes events stamped with `current_user_id()`.
- `src/features/auth/use-profile.ts` `fetchMyProfile` is a **direct table
  SELECT** as the `authenticated` role → fully subject to RLS.

The `events` table confirms the write path and the read path diverge by design,
not by session instability within a single attempt:

| user_id | name | created_at |
|---|---|---|
| …345fba | onboarding_completed | 2026-10-04 18:09:52+00 |
| …345fba | session_start | 2026-10-04 18:09:52+00 |
| …287935 | onboarding_completed | 2026-10-04 18:05:24+00 |
| …287935 | session_start | 2026-10-04 18:05:24+00 |

So the SECURITY DEFINER paths (`create_profile`, `log_events`) all record the
same sub for a given session, while the only thing that ever fails is the one
RLS-gated path (`fetchMyProfile`). That is exactly the fingerprint of a sub that
does not line up with the row at read time — never a broken policy.

### 6. Client token wiring (for completeness)

`src/lib/supabase.ts` sends the Auth0 **ID token** on every request via the
`accessToken` callback (`getIdTokenSafe`, `src/lib/auth0.ts`). The RPC wrapper
(`src/features/auth/api/create-profile.ts`) and `fetchMyProfile` both use the
**same** `supabase` singleton, so they use the **same** token source. There is
no second client or alternate token path. On success the onboarding screen
(`app/(auth)/onboarding.tsx`) does `invalidateQueries(PROFILE_QUERY_KEY)` and
intentionally leaves `busy=true`, delegating navigation to `AuthGate`
(`src/features/auth/auth-gate.tsx`), which routes to `/onboarding` whenever
`hasProfile=false`. That is why a zero-row read presents as an endless spinner
rather than an error.

## Conclusions — root causes ranked by evidence

1. **(Strongest) Non-stable Auth0 `sub` across attempts — identity is being
   re-created, not reused.** Five attempts produced five distinct `auth0|…`
   users, each with a full profile. A profile written under sub A is invisible
   to any later session whose token carries sub B, so the RLS SELECT returns
   zero rows and onboarding never completes. This fully explains the
   "worked then stopped / asks for a username again" behavior across attempts:
   every pass is a brand-new user with no profile. (Maps to hypothesis 1.)

   The likely upstream reason is the login/sign-up flow in
   `app/(auth)/welcome.tsx` → `useSession().login()` →
   `authorize({ scope: 'openid profile email offline_access' })`. With a Database
   connection and Universal Login configured for sign-up, repeated runs create
   new accounts instead of signing the user back into the existing one
   (no stored session reused, or sign-up chosen each time). This needs to be
   confirmed in the Auth0 tenant (see "How to confirm" below).

2. **(Plausible, needs one check within a single session) Read-time request
   carries no `authenticated` sub, so RLS sees null.** If, on the GET to
   `/rest/v1/profiles`, the ID token is missing/stale/rejected (e.g.
   `getIdTokenSafe` returns `null`, or the token lacks the
   `role: authenticated` claim added by the Auth0 Action so Supabase does not
   assign the `authenticated` role), `current_user_id()` is null and the SELECT
   returns zero rows — same symptom. Within the `swift-turtle` session the
   SECURITY DEFINER `log_events` call clearly had a non-null sub, which makes a
   whole-session token failure unlikely, but a race where the profile query
   fires under the previous (or an anonymous) session before the newest login
   settles would also produce a transient zero-row read. (Maps to hypothesis 2;
   note SECURITY DEFINER does NOT bypass the need for `auth.jwt()`, but it does
   bypass RLS, which is why the write path never surfaced this.)

3. **Ruled out: grant/revoke ordering (hypothesis 3).** `authenticated` holds
   SELECT on `public.profiles` on the live DB (Evidence 3).

4. **Ruled out: policy predicate mismatch (hypothesis 4).** The live predicate
   is `user_id = (select current_user_id())` and resolves the Auth0 `sub`
   correctly; a matching-sub SELECT returns the row (Evidence 4).

## How to confirm the top cause (no changes required)

- Decode the current ID token (the one logged as `len 1171`) at jwt.io and read
  its `sub`. Compare it to the newest `profiles.user_id`
  (`auth0|6ac296595d712d2d2a345fba`). If the app is currently stuck and the
  token's `sub` is NOT that value, cause #1/#2 is confirmed directly. Also check
  the token has `role: "authenticated"` and that `aud`/`iss` match the Auth0
  tenant Supabase is configured to trust.
- In the Auth0 dashboard: User Management → Users. If there are five (or more)
  users created in the same window with the same email, Universal Login is
  creating a new account per attempt — the identity-stability problem.
- Confirm the Supabase → Authentication → Third-Party Auth (Auth0) integration
  is enabled for this project and that the Auth0 Action adding
  `role: authenticated` runs on the ID token for this connection.

## Recommended fixes (do NOT implement here)

Primary (fix identity reuse — addresses cause #1):
- Make login resolve to a **single stable user**. Ensure Universal Login signs
  an existing user back in instead of signing up a new account each time
  (correct connection, "Login" vs "Sign up" affordance, and reuse of the stored
  session via the Credentials Manager so a returning user is not re-prompted
  into a new signup). The two welcome buttons both call the same
  `login()` with no `screen_hint`, so Auth0's default screen determines sign-up
  vs login — verify that default and the connection settings.
- Verify `getIdTokenSafe()` returns the SAME `sub` on consecutive calls within a
  session, and that a relaunch restores the same session (so the sub persists
  across app restarts).

Secondary (make the read path honor the session reliably — guards cause #2):
- Ensure the profile SELECT does not fire until the newest Auth0 session is
  settled (gate the query strictly on a confirmed `isSignedIn` + a resolved
  token), so a stale/previous or anonymous token cannot produce a transient
  zero-row read that strands the gate on `/onboarding`.

Data cleanup (after identity is fixed):
- The five orphaned single-attempt users
  (`merry-wombat-6572`, `noble-badger-5185`, `gentle-walrus-4665`,
  `cosmic-gecko-6781`, `swift-turtle-5386`) are test rows from these attempts.
  Once the correct, stable user id is known, delete the stale rows (consents /
  paper_accounts / user_stats cascade from `profiles.user_id`). This is a
  recommendation only; no deletion was performed.

Note: nothing in the schema, policies, grants, or functions needs to change to
"let the SELECT work" — it already works for a matching sub. The fix belongs in
the Auth0 login flow / session handling so the read-time `sub` equals the sub
the profile was written under.

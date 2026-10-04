# lib

Cross-cutting modules: `config.ts`, `supabase.ts`, `auth0.ts`, `money.ts`,
`time.ts`, `analytics.ts`, `errors.ts`. Only `supabase.ts` creates the Supabase
client; only `auth0.ts` touches the Auth0 SDK.

`config.ts` validates the public `EXPO_PUBLIC_*` client environment with Zod and
exposes a typed `config`. It fails fast with a readable error that names any
missing or malformed variable and never prints values. The rest are populated by
later tasks.

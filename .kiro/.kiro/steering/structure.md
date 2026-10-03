---
inclusion: always
---
# Project Structure and Conventions
 
## Repository layout
masari/
  .kiro/steering/            steering files (this folder)
  .kiro/specs/<spec-name>/   requirements.md, design.md, tasks.md per spec
  app/                       Expo Router screens: thin, compose features
    (auth)/                  age-gate, welcome, onboarding
    (tabs)/                  learn, explore, portfolio, profile
    lesson/[id].tsx          lesson player
    stock/[symbol].tsx       stock detail
    trade/[symbol].tsx       order ticket (modal)
    settings/                account, legal, delete account
  src/
    features/                auth, lessons, trading, explore, progress, settings
      <feature>/             components/, hooks/, api/, store/, types.ts, *.test.ts(x)
    components/ui/           shared presentational components (Button, Card, Sheet...)
    lib/                     supabase.ts, auth0.ts, money.ts, time.ts, analytics.ts, errors.ts
    theme/                   tokens (colors, spacing, type), light/dark
    types/db.ts              GENERATED from Supabase; never hand-edit
  content/lessons/           one JSON file per lesson (L0.json, L1.1.json ...)
  supabase/
    config.toml
    migrations/              timestamped .sql, never edit an applied migration
    functions/               ingest-quotes/, ingest-bars/, delete-account/, _shared/
    seed/                    instruments.csv, holidays.csv, seed.sql
    tests/                   pgTAP tests (*.test.sql)
  scripts/                   validate-content.ts, sync-catalog.ts, seed-instruments.ts
  docs/                      lesson-plan.md, db-and-api-reference.md, legal/
  .github/workflows/ci.yml
  app.config.ts, eas.json
 
## Naming
- Files and folders: kebab-case. React components: PascalCase. Hooks: useThing. Zod schemas: thingSchema.
- DB: snake_case, plural table names, text ids for Auth0 users, uuid ids for app-owned rows.
- Edge Functions: kebab-case folder with index.ts.
- Lesson ids: L0, L1.1 ... B1 (boss), match content filenames and lessons_catalog.lesson_id.
- Feature keys: dotted lowercase (trade.market_buy). Defined once in src/features/progress/feature-keys.ts and in feature_unlock_rules.
 
## Boundaries
- Screens in app/ contain no business logic; they call feature hooks.
- Only src/lib/supabase.ts creates the Supabase client. Only src/lib/auth0.ts touches the Auth0 SDK.
- UI never computes balances, fills, XP, or unlocks. It calls RPCs and renders results.
- Lesson step components are pure: props in, onAnswer out. No network calls inside step components.
- Shared pure logic (money, scoring, seeded RNG) has unit tests beside it.
 
## Git workflow
- Branch per task: feat/<spec>-<task-number>-<slug>. Conventional commits (feat:, fix:, chore:, test:, docs:).
- Never commit .env files or secrets. .env.example lists variable NAMES only.
 
## Definition of done (every task)
Typecheck and lint pass; relevant tests written and green; no secrets in diff; acceptance criteria in the spec checked off; docs updated if behavior changed.

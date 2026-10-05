# supabase/seed

Seed data loaded after migrations on `supabase db reset` (see `[db.seed]` in
`supabase/config.toml`, which lists the files in order).

- `seed.sql` — hand-written reference data (`app_config`).
- `catalog.generated.sql` — the lesson catalog (`lessons_catalog`,
  `feature_unlock_rules`), **generated** from `content/lessons/*.json` by
  `scripts/sync-catalog.ts`. DO NOT edit by hand. Regenerate after changing
  lesson content with:

  ```bash
  npm run sync:catalog -- --out supabase/seed/catalog.generated.sql
  ```

  It uses `insert ... on conflict do update`, so it is safe to re-run against an
  existing database. A local `supabase db reset` applies it automatically; to
  seed a remote/linked project, apply it explicitly (see below).

- `instruments.csv`, `holidays.csv` — human-readable source of truth for the
  instrument universe (~50 symbols, 8 starters) and the NYSE holiday calendar.
- `instruments.sql`, `holidays.sql` — idempotent (`insert ... on conflict do
  update`) seeds generated from the CSVs above and listed in `config.toml`
  `[db.seed]`. Keep each `.sql` in sync with its `.csv`. Apply to a linked
  project the same way as the catalog (`psql "$DATABASE_URL" -f ...`).

## Seeding a remote project

The catalog must exist in any database the app talks to, because
`complete_lesson` / `submit_assessment` reference `lessons_catalog` by foreign
key. After migrations are pushed to a linked project, apply the catalog seed:

```bash
psql "$DATABASE_URL" -f supabase/seed/catalog.generated.sql
```

(or paste its contents into the Supabase SQL editor).

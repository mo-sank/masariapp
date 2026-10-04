# scripts

Project scripts, run with `tsx` (see the npm scripts in `package.json`).

- `validate-content.ts` — validates every `content/lessons/*.json` file against
  the Zod lesson schema (`src/features/lessons/schema.ts`) and the cross-file
  rules (unique lesson ids, existing prerequisites). Run with
  `npm run validate:content`; it exits non-zero on any problem, so CI fails.
- `sync-catalog.ts` — generates idempotent seed SQL for `lessons_catalog` and
  `feature_unlock_rules` from `content/lessons/*.json` (requirement 1.4). Run
  with `npm run sync:catalog` to print the SQL, or
  `npm run sync:catalog -- --out <path>` to write it to a file. Catalog rows are
  ordered so prerequisites load first. Run `validate:content` first; the sync
  script only guards the invariants its SQL depends on (unique lesson ids and
  feature keys).
- `seed-instruments.ts` — added by a later spec.

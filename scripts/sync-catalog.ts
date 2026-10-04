#!/usr/bin/env tsx
/**
 * Catalog sync — generate seed SQL for the lesson catalog (requirement 1.4).
 *
 * Reads every `content/lessons/*.json` file, validates it through the same Zod
 * lesson schema the app and `validate:content` use (src/features/lessons/schema.ts),
 * and emits idempotent seed SQL for the two catalog tables created by task 2
 * (supabase/migrations/20250104000001_learning_tables.sql):
 *
 *   - lessons_catalog(lesson_id, unit, sort_order, kind, xp_base, pass_score,
 *                     prerequisite_lesson_id)
 *       one row per lesson. `sort_order`, `xp_base`, and `pass_score` come from
 *       the lesson's `order`, `xp`, and `passScore`.
 *   - feature_unlock_rules(feature_key, lesson_id, description)
 *       one row per entry in a lesson's `unlocks[]`; the lesson that unlocks the
 *       feature is the source lesson. `description` is left NULL — content files
 *       do not carry per-feature descriptions.
 *
 * The script does NOT re-validate cross-file rules the way validate-content does
 * (that is that script's job and should be run first / in CI). It does enforce
 * the two invariants the catalog SQL itself depends on, so a bad content set
 * produces a clear error instead of SQL that fails at load time:
 *   - lesson ids are unique (lessons_catalog.lesson_id is the primary key);
 *   - feature keys are unique across all lessons (feature_unlock_rules.feature_key
 *     is the primary key).
 * Catalog rows are ordered so a lesson's prerequisite is always inserted before
 * it, satisfying the self-referencing FK on prerequisite_lesson_id.
 *
 * The generated SQL uses `insert ... on conflict do update` so it is safe to
 * re-run on an existing database (e.g. during `supabase db reset`).
 *
 * Usage:
 *   npm run sync:catalog                 # print SQL to stdout
 *   npm run sync:catalog -- --out <path> # write SQL to <path>
 *
 * `LESSONS_DIR` overrides the content directory (used by the tests); it is not
 * used in normal runs or CI.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lessonSchema, type Lesson } from '../src/features/lessons/schema';

/**
 * This module's own file URL. `import.meta.url` is the natural source under
 * `tsx`, but Jest's CommonJS transform leaves `import.meta.url` null when the
 * tests import `buildCatalogSql`, so fall back to a sentinel. The fallback is
 * only ever reached under Jest, where the tests always set `LESSONS_DIR` and
 * never invoke `main`, so project-root resolution below is unused there.
 */
const moduleUrl = typeof import.meta.url === 'string' ? import.meta.url : '';
const scriptDir = moduleUrl ? dirname(fileURLToPath(moduleUrl)) : process.cwd();
const projectRoot = join(scriptDir, '..');

const lessonsDir = process.env.LESSONS_DIR ?? join(projectRoot, 'content', 'lessons');

/** Print a fatal error and exit non-zero so `npm run sync:catalog` and CI fail. */
function fail(message: string): never {
  console.error(`✖ sync-catalog: ${message}`);
  process.exit(1);
}

/** Quote a value as a SQL string literal, escaping embedded single quotes. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** A SQL string literal, or NULL for null/undefined. */
function sqlStringOrNull(value: string | null | undefined): string {
  return value == null ? 'NULL' : sqlString(value);
}

/** Read and schema-validate every lesson JSON file in the content directory. */
function loadLessons(): Lesson[] {
  let entries: string[];
  try {
    entries = readdirSync(lessonsDir);
  } catch {
    fail(`could not read lessons directory: ${lessonsDir}`);
  }

  const files = entries.filter((name) => name.endsWith('.json')).sort();
  const lessons: Lesson[] = [];

  for (const name of files) {
    const absolute = join(lessonsDir, name);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(absolute, 'utf8'));
    } catch (err) {
      fail(`${name}: invalid JSON: ${(err as Error).message}`);
    }

    const result = lessonSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      const where = first.path.length ? `${first.path.join('.')}: ` : '';
      fail(`${name} failed schema validation (run validate:content for the full report): ${where}${first.message}`);
    }
    lessons.push(result.data);
  }

  return lessons;
}

/**
 * Order lessons so every lesson appears after its prerequisite. The catalog's
 * self FK on prerequisite_lesson_id would otherwise reject a forward reference.
 * Prerequisites that point outside the content set are reported as an error
 * (validate:content enforces this too, but we must not emit SQL that fails).
 */
function orderByPrerequisite(lessons: Lesson[]): Lesson[] {
  const byId = new Map(lessons.map((l) => [l.id, l] as const));
  const ordered: Lesson[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();

  const place = (lesson: Lesson): void => {
    if (placed.has(lesson.id)) return;
    if (visiting.has(lesson.id)) {
      fail(`prerequisite cycle detected involving lesson "${lesson.id}"`);
    }
    visiting.add(lesson.id);
    if (lesson.prerequisite !== null) {
      const prereq = byId.get(lesson.prerequisite);
      if (!prereq) {
        fail(`lesson "${lesson.id}" has prerequisite "${lesson.prerequisite}" with no matching lesson (run validate:content)`);
      }
      place(prereq);
    }
    visiting.delete(lesson.id);
    placed.add(lesson.id);
    ordered.push(lesson);
  };

  // Preserve the input (file-name sorted) order among independent lessons.
  for (const lesson of lessons) place(lesson);
  return ordered;
}

/** Build the complete seed SQL text from the validated lessons. */
export function buildCatalogSql(lessons: Lesson[]): string {
  // Guard the lessons_catalog primary key.
  const seenIds = new Set<string>();
  for (const lesson of lessons) {
    if (seenIds.has(lesson.id)) {
      fail(`duplicate lesson id "${lesson.id}" (run validate:content)`);
    }
    seenIds.add(lesson.id);
  }

  const ordered = orderByPrerequisite(lessons);

  // Collect unlock rules and guard the feature_unlock_rules primary key.
  const unlockOwner = new Map<string, string>();
  const unlockRows: { featureKey: string; lessonId: string }[] = [];
  for (const lesson of ordered) {
    for (const featureKey of lesson.unlocks) {
      const existing = unlockOwner.get(featureKey);
      if (existing) {
        fail(`feature "${featureKey}" is unlocked by more than one lesson ("${existing}" and "${lesson.id}"); feature_key must be unique`);
      }
      unlockOwner.set(featureKey, lesson.id);
      unlockRows.push({ featureKey, lessonId: lesson.id });
    }
  }

  const catalogValues = ordered
    .map((l) =>
      `  (${sqlString(l.id)}, ${l.unit}, ${l.order}, ${sqlString(l.kind)}, ${l.xp}, ${l.passScore}, ${sqlStringOrNull(l.prerequisite)})`,
    )
    .join(',\n');

  const lines: string[] = [];
  lines.push('-- Generated by scripts/sync-catalog.ts from content/lessons/*.json (requirement 1.4).');
  lines.push('-- DO NOT EDIT BY HAND. Re-run `npm run sync:catalog` after changing lesson content.');
  lines.push('-- Seeds lessons_catalog and feature_unlock_rules');
  lines.push('-- (supabase/migrations/20250104000001_learning_tables.sql).');
  lines.push('');

  if (ordered.length === 0) {
    lines.push('-- No lesson files found; nothing to seed.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('insert into public.lessons_catalog');
  lines.push('  (lesson_id, unit, sort_order, kind, xp_base, pass_score, prerequisite_lesson_id)');
  lines.push('values');
  lines.push(`${catalogValues}`);
  lines.push('on conflict (lesson_id) do update set');
  lines.push('  unit = excluded.unit,');
  lines.push('  sort_order = excluded.sort_order,');
  lines.push('  kind = excluded.kind,');
  lines.push('  xp_base = excluded.xp_base,');
  lines.push('  pass_score = excluded.pass_score,');
  lines.push('  prerequisite_lesson_id = excluded.prerequisite_lesson_id;');
  lines.push('');

  if (unlockRows.length > 0) {
    const unlockValues = unlockRows
      .map((r) => `  (${sqlString(r.featureKey)}, ${sqlString(r.lessonId)}, NULL)`)
      .join(',\n');
    lines.push('insert into public.feature_unlock_rules');
    lines.push('  (feature_key, lesson_id, description)');
    lines.push('values');
    lines.push(`${unlockValues}`);
    lines.push('on conflict (feature_key) do update set');
    lines.push('  lesson_id = excluded.lesson_id,');
    lines.push('  description = excluded.description;');
    lines.push('');
  } else {
    lines.push('-- No feature unlocks declared in any lesson.');
    lines.push('');
  }

  return lines.join('\n');
}

/** Parse `--out <path>` (the only flag) from argv. */
function parseOutPath(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf('--out');
  if (flagIndex === -1) return undefined;
  const value = argv[flagIndex + 1];
  if (!value) {
    fail('--out requires a file path');
  }
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function main(): void {
  const outPath = parseOutPath(process.argv.slice(2));
  const lessons = loadLessons();
  const sql = buildCatalogSql(lessons);

  if (outPath) {
    writeFileSync(outPath, sql, 'utf8');
    console.error(`✓ sync-catalog: wrote seed SQL for ${lessons.length} lesson${lessons.length === 1 ? '' : 's'} to ${outPath}`);
  } else {
    process.stdout.write(sql);
  }
}

// Run only when executed as a script (tsx scripts/sync-catalog.ts), not when
// imported by the tests, which call buildCatalogSql directly.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (moduleUrl && invokedPath === fileURLToPath(moduleUrl)) {
  main();
}

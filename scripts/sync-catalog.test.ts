/**
 * Tests for the catalog sync script (requirement 1.4).
 *
 * Two layers, mirroring scripts/validate-content's test strategy:
 *  1. Unit layer — exercise `buildCatalogSql` directly with in-memory lessons to
 *     prove the column mapping, prerequisite ordering, idempotent conflict
 *     clauses, SQL escaping, and the unique-key guards.
 *  2. Script layer — run `scripts/sync-catalog.ts` end to end against a temp
 *     content directory (via LESSONS_DIR) to prove it reads, validates, and
 *     prints SQL, and that `--out` writes a file.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildCatalogSql } from './sync-catalog';
import { lessonSchema, type Lesson } from '../src/features/lessons/schema';

const projectRoot = join(__dirname, '..');
const scriptPath = join(projectRoot, 'scripts', 'sync-catalog.ts');

/** A minimal valid lesson with a single scored step, overridable per test. */
function makeLesson(overrides: Partial<Lesson> & { id: string }): Lesson {
  const base = {
    unit: 1,
    order: 1,
    kind: 'lesson' as const,
    title: 'Title',
    bigIdea: 'Big idea.',
    estimatedMinutes: 3,
    xp: 10,
    passScore: 60,
    prerequisite: null,
    concepts: ['c'],
    unlocks: [],
    steps: [
      {
        id: 's1',
        type: 'truefalse',
        prompt: 'True or false?',
        answer: true,
        explanation: 'Because.',
        scored: true,
        concept: 'c',
      },
    ],
    ...overrides,
  };
  // Round-trip through the schema so defaults match a real parse.
  const result = lessonSchema.safeParse(base);
  if (!result.success) {
    throw new Error(`test lesson ${overrides.id} is invalid: ${result.error.message}`);
  }
  return result.data;
}

describe('buildCatalogSql (requirement 1.4)', () => {
  it('maps lesson fields onto the lessons_catalog columns', () => {
    const sql = buildCatalogSql([
      makeLesson({ id: 'L1.1', unit: 2, order: 5, kind: 'lesson', xp: 15, passScore: 70, prerequisite: null }),
    ]);
    expect(sql).toContain('insert into public.lessons_catalog');
    expect(sql).toContain('(lesson_id, unit, sort_order, kind, xp_base, pass_score, prerequisite_lesson_id)');
    // order -> sort_order, xp -> xp_base, passScore -> pass_score
    expect(sql).toContain("('L1.1', 2, 5, 'lesson', 15, 70, NULL)");
  });

  it('emits a null prerequisite as SQL NULL and a present one as a quoted id', () => {
    const sql = buildCatalogSql([
      makeLesson({ id: 'L0', unit: 0, order: 0, kind: 'placement', prerequisite: null }),
      makeLesson({ id: 'L1.1', prerequisite: 'L0' }),
    ]);
    expect(sql).toContain("('L0', 0, 0, 'placement',");
    expect(sql).toMatch(/\('L1\.1',[^\n]*'L0'\)/);
  });

  it('orders rows so a prerequisite is inserted before the lesson that needs it', () => {
    // Provide the dependent lesson first to prove reordering happens.
    const sql = buildCatalogSql([
      makeLesson({ id: 'L1.1', prerequisite: 'L0' }),
      makeLesson({ id: 'L0', unit: 0, order: 0, kind: 'placement', prerequisite: null }),
    ]);
    const l0 = sql.indexOf("('L0'");
    const l11 = sql.indexOf("('L1.1'");
    expect(l0).toBeGreaterThanOrEqual(0);
    expect(l11).toBeGreaterThan(l0);
  });

  it('uses idempotent on-conflict clauses for both tables', () => {
    const sql = buildCatalogSql([makeLesson({ id: 'L1.1', unlocks: ['explore'] })]);
    expect(sql).toContain('on conflict (lesson_id) do update set');
    expect(sql).toContain('insert into public.feature_unlock_rules');
    expect(sql).toContain('on conflict (feature_key) do update set');
    expect(sql).toContain("('explore', 'L1.1', NULL)");
  });

  it('emits no feature_unlock_rules insert when no lesson unlocks anything', () => {
    const sql = buildCatalogSql([makeLesson({ id: 'L0', unlocks: [] })]);
    expect(sql).not.toContain('insert into public.feature_unlock_rules');
    expect(sql).toContain('No feature unlocks');
  });

  it('escapes single quotes in string values', () => {
    // Feature keys are the only author-controlled string that lands in SQL here
    // besides ids/kind; prove the escaper doubles embedded quotes.
    const sql = buildCatalogSql([makeLesson({ id: 'L1.1', unlocks: ["o'brien"] })]);
    expect(sql).toContain("('o''brien', 'L1.1', NULL)");
  });

  it('rejects a feature unlocked by more than one lesson', () => {
    const spy = jest.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('exit');
    }) as never);
    expect(() =>
      buildCatalogSql([
        makeLesson({ id: 'L1.1', unlocks: ['explore'] }),
        makeLesson({ id: 'L1.2', prerequisite: 'L1.1', unlocks: ['explore'] }),
      ]),
    ).toThrow('exit');
    spy.mockRestore();
  });
});

describe('sync-catalog.ts end to end (requirement 1.4)', () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  function stage(files: Record<string, unknown>): string {
    tmp = mkdtempSync(join(tmpdir(), 'sync-catalog-'));
    for (const [name, data] of Object.entries(files)) {
      writeFileSync(join(tmp, name), JSON.stringify(data));
    }
    return tmp;
  }

  function run(lessonsDir: string, args: string[] = []): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync('npx', ['tsx', scriptPath, ...args], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, LESSONS_DIR: lessonsDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout, stderr: '' };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  }

  it('prints seed SQL for a well-formed content set', () => {
    const dir = stage({
      'L0.json': makeLesson({ id: 'L0', unit: 0, order: 0, kind: 'placement', prerequisite: null }),
      'L1.1.json': makeLesson({ id: 'L1.1', prerequisite: 'L0', unlocks: ['explore'] }),
    });
    const { status, stdout } = run(dir);
    expect(status).toBe(0);
    expect(stdout).toContain('insert into public.lessons_catalog');
    expect(stdout).toContain("('explore', 'L1.1', NULL)");
  });

  it('writes to a file with --out', () => {
    const dir = stage({
      'L0.json': makeLesson({ id: 'L0', unit: 0, order: 0, kind: 'placement', prerequisite: null }),
    });
    const outFile = join(dir, 'catalog.generated.sql');
    const { status } = run(dir, ['--out', outFile]);
    expect(status).toBe(0);
    const written = readFileSync(outFile, 'utf8');
    expect(written).toContain('insert into public.lessons_catalog');
    expect(written).toContain("('L0', 0, 0, 'placement',");
  });

  it('fails when a lesson file is not valid JSON', () => {
    tmp = mkdtempSync(join(tmpdir(), 'sync-catalog-'));
    writeFileSync(join(tmp, 'broken.json'), '{ not json');
    const { status, stderr } = run(tmp);
    expect(status).toBe(1);
    expect(stderr).toMatch(/invalid JSON/i);
  });
});

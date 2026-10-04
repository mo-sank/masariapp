/**
 * Tests for the lesson content schema (requirements 1.1, 1.2, 1.3).
 *
 * Two layers:
 *  1. Schema layer — parse the valid/invalid fixtures through `lessonSchema`
 *     directly. Valid fixtures must parse; each invalid fixture isolates one
 *     schema-level rule and must fail.
 *  2. Script layer — run `scripts/validate-content.ts` against generated
 *     directories to prove the cross-file rules (unique lesson ids, existing
 *     prerequisites) and the exit-code/reporting contract (requirement 1.2).
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lessonSchema } from './schema';

const fixturesDir = join(__dirname, '__fixtures__');
const validDir = join(fixturesDir, 'valid');
const invalidDir = join(fixturesDir, 'invalid');
const projectRoot = join(__dirname, '..', '..', '..');
const scriptPath = join(projectRoot, 'scripts', 'validate-content.ts');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Run the validator against a throwaway lessons directory. The script reads
 * `LESSONS_DIR` when set, so the test points it at a temp fixture directory and
 * inspects the exit status and combined stdout/stderr.
 */
function runValidator(lessonsDir: string): { status: number; output: string } {
  try {
    const output = execFileSync(
      'npx',
      ['tsx', scriptPath],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, LESSONS_DIR: lessonsDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return { status: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('lessonSchema (requirement 1.1, 1.3)', () => {
  const validFiles = readdirSync(validDir).filter((f) => f.endsWith('.json'));
  const invalidFiles = readdirSync(invalidDir).filter((f) => f.endsWith('.json'));

  it('has fixtures to test', () => {
    expect(validFiles.length).toBeGreaterThan(0);
    expect(invalidFiles.length).toBeGreaterThan(0);
  });

  it.each(validFiles)('accepts valid fixture %s', (file) => {
    const result = lessonSchema.safeParse(readJson(join(validDir, file)));
    if (!result.success) {
      throw new Error(
        `${file} should be valid but failed:\n${result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    expect(result.success).toBe(true);
  });

  // Each of these is caught by the schema itself (not the cross-file script).
  const schemaLevelInvalid = invalidFiles.filter((f) => f !== 'missing-prerequisite.json');
  it.each(schemaLevelInvalid)('rejects invalid fixture %s', (file) => {
    const result = lessonSchema.safeParse(readJson(join(invalidDir, file)));
    expect(result.success).toBe(false);
  });

  it('applies defaults: mcq is scored and variant defaults to standard', () => {
    const result = lessonSchema.safeParse(readJson(join(validDir, 'L1.1.json')));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const mcq = result.data.steps.find((s) => s.type === 'mcq');
    expect(mcq?.type).toBe('mcq');
    if (mcq?.type === 'mcq') {
      expect(mcq.scored).toBe(true);
      expect(mcq.variant).toBe('explain');
    }
  });

  it('reports the concept-tag rule for a scored item (requirement 1.3)', () => {
    const result = lessonSchema.safeParse(readJson(join(invalidDir, 'scored-without-concept.json')));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => /concept/i.test(i.message))).toBe(true);
  });
});

describe('validate-content.ts cross-file rules (requirement 1.2)', () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  function stage(files: Record<string, unknown>): string {
    tmp = mkdtempSync(join(tmpdir(), 'lesson-content-'));
    for (const [name, data] of Object.entries(files)) {
      writeFileSync(join(tmp, name), JSON.stringify(data));
    }
    return tmp;
  }

  it('passes for a well-formed set of lessons', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lesson-content-'));
    tmp = dir;
    cpSync(validDir, dir, { recursive: true });
    const { status, output } = runValidator(dir);
    expect(status).toBe(0);
    expect(output).toMatch(/Validated/);
  });

  it('fails and names the file for a missing prerequisite', () => {
    const dir = stage({
      'A.json': readJson(join(invalidDir, 'missing-prerequisite.json')),
    });
    const { status, output } = runValidator(dir);
    expect(status).toBe(1);
    expect(output).toMatch(/prerequisite/i);
    expect(output).toMatch(/A\.json/);
  });

  it('fails for duplicate lesson ids across files', () => {
    const base = readJson(join(validDir, 'L0.json'));
    const dir = stage({ 'first.json': base, 'second.json': base });
    const { status, output } = runValidator(dir);
    expect(status).toBe(1);
    expect(output).toMatch(/duplicate lesson id/i);
  });

  it('fails and names the step id for a schema violation', () => {
    const dir = stage({
      'bad.json': readJson(join(invalidDir, 'scored-without-concept.json')),
    });
    const { status, output } = runValidator(dir);
    expect(status).toBe(1);
    expect(output).toMatch(/step "s1"/);
  });
});

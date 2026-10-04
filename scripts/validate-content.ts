#!/usr/bin/env tsx
/**
 * Lesson content validation (requirements 1.1, 1.2, 1.3).
 *
 * Validates every `content/lessons/*.json` file against the Zod lesson schema
 * (src/features/lessons/schema.ts) plus the cross-file rules that need the whole
 * set of lessons:
 *   - lesson ids are globally unique;
 *   - every `prerequisite` references a lesson that exists;
 *   - (per-lesson/per-step rules — unique step ids, scored items carry a concept
 *     tag, correctId/bucket references — are enforced inside the schema itself.)
 *
 * On any failure it prints the offending file, the step id (when the error is
 * inside a step), and a human-readable reason, then exits non-zero so
 * `npm run validate:content` and CI fail (requirement 1.2). On success it prints
 * a short summary and exits 0.
 *
 * Run with: `npm run validate:content` (which invokes `tsx scripts/...`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ZodError, ZodIssue } from 'zod';

import { lessonSchema, type Lesson } from '../src/features/lessons/schema';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');

// Default to the bundled content directory. `LESSONS_DIR` overrides it so the
// test suite can point the validator at throwaway fixture directories without
// disturbing real content; it is not used in normal runs or CI.
const lessonsDir = process.env.LESSONS_DIR ?? join(projectRoot, 'content', 'lessons');

/** A single validation problem, tied back to a file and (optionally) a step. */
type Problem = {
  file: string;
  stepId?: string;
  message: string;
};

/** Pretty-print and exit non-zero (requirement 1.2). */
function fail(problems: Problem[]): never {
  console.error(`\n✖ Lesson content validation failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n`);
  for (const p of problems) {
    const where = p.stepId ? `${p.file} (step "${p.stepId}")` : p.file;
    console.error(`  • ${where}\n      ${p.message}`);
  }
  console.error('');
  process.exit(1);
}

/**
 * Turn a Zod issue into a Problem. When the issue is located inside a step
 * (`steps[<index>]...`), look up that step's id so the report names it, as
 * requirement 1.2 asks for the step id, not just an array index.
 */
function issueToProblem(file: string, raw: unknown, issue: ZodIssue): Problem {
  const path = issue.path;
  let stepId: string | undefined;
  if (path[0] === 'steps' && typeof path[1] === 'number') {
    const steps = (raw as { steps?: unknown[] } | undefined)?.steps;
    const step = Array.isArray(steps) ? (steps[path[1]] as { id?: unknown } | undefined) : undefined;
    if (step && typeof step.id === 'string') {
      stepId = step.id;
    }
  }
  const fieldPath = path.join('.');
  const message = fieldPath ? `${fieldPath}: ${issue.message}` : issue.message;
  return { file, stepId, message };
}

function collectIssues(file: string, raw: unknown, error: ZodError): Problem[] {
  return error.issues.map((issue) => issueToProblem(file, raw, issue));
}

function main(): void {
  let entries: string[];
  try {
    entries = readdirSync(lessonsDir);
  } catch {
    console.error(`✖ Could not read lessons directory: ${lessonsDir}`);
    process.exit(1);
  }
  const files = entries.filter((name) => name.endsWith('.json')).sort();

  const problems: Problem[] = [];
  const lessons: { file: string; lesson: Lesson }[] = [];

  // Pass 1: parse + schema-validate each file independently.
  for (const name of files) {
    const absolute = join(lessonsDir, name);
    // Report a path relative to the project root for the real content dir; for an
    // out-of-tree override (tests) fall back to the bare file name.
    const rel = relative(projectRoot, absolute);
    const file = rel.startsWith('..') || isAbsolute(rel) ? basename(absolute) : rel;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(absolute, 'utf8'));
    } catch (err) {
      problems.push({ file, message: `invalid JSON: ${(err as Error).message}` });
      continue;
    }

    const result = lessonSchema.safeParse(raw);
    if (result.success) {
      lessons.push({ file, lesson: result.data });
    } else {
      problems.push(...collectIssues(file, raw, result.error));
    }
  }

  // Pass 2: cross-file rules over the lessons that parsed cleanly.
  const idToFile = new Map<string, string>();
  for (const { file, lesson } of lessons) {
    const existing = idToFile.get(lesson.id);
    if (existing) {
      problems.push({
        file,
        message: `duplicate lesson id "${lesson.id}" (also defined in ${existing})`,
      });
    } else {
      idToFile.set(lesson.id, file);
    }
  }

  for (const { file, lesson } of lessons) {
    if (lesson.prerequisite !== null && !idToFile.has(lesson.prerequisite)) {
      problems.push({
        file,
        message: `prerequisite "${lesson.prerequisite}" does not match any lesson id`,
      });
    }
  }

  if (problems.length > 0) {
    fail(problems);
  }

  if (lessons.length === 0) {
    console.log('validate:content — no lesson files found; nothing to validate.');
    return;
  }

  console.log(`✓ Validated ${lessons.length} lesson file${lessons.length === 1 ? '' : 's'}.`);
}

main();

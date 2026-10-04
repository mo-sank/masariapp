/**
 * Lesson content loader (requirements 3.1, 5.1).
 *
 * Lessons ship as JSON files under `content/lessons` (requirement 1.1). This
 * module is the app's single entry point to that content: it imports the
 * bundled JSON, parses every lesson through the Zod `lessonSchema`, and exposes
 * a parsed lesson by id (`getLesson`) or the whole catalog (`listLessons`). The
 * lesson player (requirement 3.1) and scoring (requirement 5.1) consume the
 * typed `Lesson` returned here and never touch raw JSON.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md`
 * ("content.ts: static map of lesson id -> parsed JSON (validated at build and
 * dev start); getLesson(id), listLessons()").
 *
 * Why validate again at runtime when `validate:content` already runs in CI
 * (requirement 1.2)? CI guards what is committed; parsing here guards what is
 * actually bundled and shipped, including content delivered over the air with
 * EAS Update after the build. A malformed lesson is a programming/content error,
 * so a failed parse throws loudly at startup rather than letting a broken lesson
 * reach a learner. The design's "validated at build and dev start" is realised
 * by this eager parse the first time the module is imported.
 *
 * Adding a lesson: author `content/lessons/<id>.json`, then add one line to
 * `RAW_LESSONS` below. Metro bundles the JSON import; there is no filesystem
 * access at runtime (React Native has no `fs`), so the imports must be static.
 *
 * This module imports only the pure schema — no Expo, React Native, or network
 * imports — so `getLesson`/`listLessons` work identically in the app and tests.
 */

import L0 from '../../../content/lessons/L0.json';
import L1_1 from '../../../content/lessons/L1.1.json';
import L1_2 from '../../../content/lessons/L1.2.json';
import L1_3 from '../../../content/lessons/L1.3.json';
import L1_4 from '../../../content/lessons/L1.4.json';
import L1_5 from '../../../content/lessons/L1.5.json';
import B1 from '../../../content/lessons/B1.json';
import L2_1 from '../../../content/lessons/L2.1.json';
import { lessonSchema, type Lesson } from './schema';

/**
 * The raw, unparsed lesson JSON bundled into the app.
 *
 * Each authored lesson under `content/lessons` is imported here as `unknown`
 * and validated below; keeping the imports in one array is what makes the set
 * of shipped lessons explicit and statically bundleable by Metro.
 *
 * Unit 0 is the placement quest (L0); unit 1 chains L1.1 -> L1.5 then the boss
 * B1; unit 2 begins with L2.1. Each lesson's `prerequisite` encodes that chain
 * (design + docs/masari-lesson-plan.md). Add a new lesson by authoring its JSON
 * and appending its import here.
 */
const RAW_LESSONS: unknown[] = [L0, L1_1, L1_2, L1_3, L1_4, L1_5, B1, L2_1];

/**
 * Parse every raw lesson through the schema once, at module load, into a map
 * keyed by lesson id. A malformed lesson throws immediately with the file-level
 * reason (design: "Invalid content ... shows a dev-only error screen locally").
 * A duplicate id is likewise a content bug and throws rather than silently
 * dropping a lesson (cross-file uniqueness is also enforced by
 * `validate:content`, but we must not build an ambiguous catalog here).
 */
function buildCatalog(raw: readonly unknown[]): Map<string, Lesson> {
  const catalog = new Map<string, Lesson>();
  raw.forEach((entry, index) => {
    const result = lessonSchema.safeParse(entry);
    if (!result.success) {
      const first = result.error.issues[0];
      const where = first.path.length ? first.path.join('.') : '(root)';
      throw new Error(
        `Invalid bundled lesson at index ${index}: ${where}: ${first.message}`,
      );
    }
    const lesson = result.data;
    if (catalog.has(lesson.id)) {
      throw new Error(`Duplicate bundled lesson id "${lesson.id}"`);
    }
    catalog.set(lesson.id, lesson);
  });
  return catalog;
}

/** Parsed lessons keyed by id, built once when this module is first imported. */
const CATALOG: ReadonlyMap<string, Lesson> = buildCatalog(RAW_LESSONS);

/**
 * Return the parsed lesson with the given id, or `undefined` if no lesson has
 * that id. Callers (the `lesson/[id]` route) render a "lesson not found" state
 * on `undefined` rather than throwing.
 */
export function getLesson(id: string): Lesson | undefined {
  return CATALOG.get(id);
}

/**
 * Return every bundled lesson, sorted by `unit` then `order` so callers get a
 * stable, path-ordered list (requirement 2.1 groups the Learn tab by unit).
 * The array is a fresh copy on each call, so callers may sort or filter it
 * without disturbing the catalog.
 */
export function listLessons(): Lesson[] {
  return [...CATALOG.values()].sort((a, b) => a.unit - b.unit || a.order - b.order);
}

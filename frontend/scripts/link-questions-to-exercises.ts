/**
 * Files already-extracted questions under their exercise, in the STAGING database (where admins work; approved
 * questions then reach live through the content sync). Uses the same rule as extraction (src/lib/exercise-link.ts):
 * a question in a chapter with a confirmed manifest goes under the one question section whose pages contain the page
 * it starts on; shared boundary pages and pages outside every section are left alone. Never overwrites a link.
 *
 *   npx tsx scripts/link-questions-to-exercises.ts           preview
 *   npx tsx scripts/link-questions-to-exercises.ts --apply   write the links
 */
import pg from 'pg';
import { readDatabaseUrls } from '../e2e/test-database';
import { problemsWithTestDatabase } from '../src/lib/test-database-guard';
import { exerciseForPage, type ExercisePages } from '../src/lib/exercise-link';

const APPLY = process.argv.includes('--apply');

async function main() {
  const { stagingUrl, liveUrl } = readDatabaseUrls();
  const problems = problemsWithTestDatabase(stagingUrl, liveUrl);
  if (problems.length) throw new Error(`Staging database not usable: ${problems.join(' ')}`);
  const client = new pg.Client({ connectionString: stagingUrl });
  await client.connect();
  try {
    const { rows: chapters } = await client.query<{ id: string; name: string }>(
      `select "id", "name" from "BookChapter" where "manifestConfirmedAt" is not null order by "name"`);
    let linked = 0;
    let unplaced = 0;
    for (const chapter of chapters) {
      const { rows: exercises } = await client.query<ExercisePages>(
        `select "id", "sectionType", "startPage", "endPage" from "BookExercise" where "chapterId" = $1`, [chapter.id]);
      const { rows: questions } = await client.query<{ id: string; sourcePageStart: number | null }>(
        `select "id", "sourcePageStart" from "Question" where "bookChapterId" = $1 and "bookExerciseId" is null`, [chapter.id]);
      const byExercise = new Map<string, string[]>();
      for (const q of questions) {
        const exerciseId = exerciseForPage(exercises, q.sourcePageStart);
        if (!exerciseId) { unplaced++; continue; }
        byExercise.set(exerciseId, [...(byExercise.get(exerciseId) ?? []), q.id]);
      }
      const count = [...byExercise.values()].reduce((n, ids) => n + ids.length, 0);
      console.log(`${chapter.name}: ${count} of ${questions.length} unlinked questions placed in ${byExercise.size} exercise(s)`);
      if (APPLY) {
        for (const [exerciseId, ids] of byExercise) {
          await client.query(`update "Question" set "bookExerciseId" = $1, "updatedAt" = now() where "id" = any($2) and "bookExerciseId" is null`, [exerciseId, ids]);
        }
      }
      linked += count;
    }
    console.log(`\n${APPLY ? 'Linked' : 'Would link'} ${linked} question(s); ${unplaced} left to page-range matching (shared or uncovered pages).`);
    if (!APPLY) console.log('Preview only. Re-run with --apply to write the links.');
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error((error as Error).message); process.exit(1); });

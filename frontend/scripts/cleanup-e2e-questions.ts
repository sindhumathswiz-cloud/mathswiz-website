/**
 * Removes the questions the end-to-end suite put into the LIVE question bank before it was moved to the staging
 * database (e2e/test-database.ts). Asked for explicitly; an exception to "archive, never delete" because these are
 * test fixtures, not question data.
 *
 *   npx tsx scripts/cleanup-e2e-questions.ts           preview: what would be removed, and why it may not be
 *   npx tsx scripts/cleanup-e2e-questions.ts --apply   removes them (JSON backup in qa-backups/ first)
 *
 * A question is removed only when ALL of these hold: its id starts with "e2e-", it was created by one of the e2e
 * accounts, and nothing outside the e2e accounts refers to it (other people's answers, tests or review cards).
 * What the e2e accounts made that points at those questions (their tests, attempts, review cards, mastery history,
 * notebook entries, bookmarks) goes with them. Nothing else is touched.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { E2E_ADMIN, E2E_STUDENT, E2E_TEACHER } from '../e2e/fixtures/data';

config({ path: '.env.local', quiet: true });
const APPLY = process.argv.includes('--apply');

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: accounts } = await client.query<{ id: string }>(`select "id" from "User" where "mobileNumber" = any($1)`, [[E2E_TEACHER.mobileNumber, E2E_STUDENT.mobileNumber, E2E_ADMIN.mobileNumber]]);
    const accountIds = accounts.map((a) => a.id);
    const { rows: questions } = await client.query<{ id: string }>(`select "id" from "Question" where "id" like 'e2e-%' and "createdById" = any($1) order by "id"`, [accountIds]);
    const ids = questions.map((q) => q.id);
    console.log(`e2e accounts: ${accountIds.length}; e2e questions: ${ids.length}`);
    if (!ids.length) return;

    const count = async (sql: string) => (await client.query<{ n: number }>(sql, [ids, accountIds])).rows[0].n;
    const foreign = {
      answers: await count(`select count(*)::int as n from "TestResponse" r join "TestAttempt" a on a."id" = r."attemptId" where r."questionId" = any($1) and a."userId" <> all($2)`),
      testSlots: await count(`select count(*)::int as n from "TestQuestion" q join "TestSection" s on s."id" = q."sectionId" join "Test" t on t."id" = s."testId" where q."questionId" = any($1) and t."createdById" <> all($2)`),
      reviewCards: await count(`select count(*)::int as n from "SpacedRepetitionCard" where "questionId" = any($1) and "userId" <> all($2)`),
      notebook: await count(`select count(*)::int as n from "MistakeNotebookEntry" where "questionId" = any($1) and "userId" <> all($2)`),
      bookmarks: await count(`select count(*)::int as n from "BookmarkItem" i join "BookmarkList" l on l."id" = i."listId" where i."questionId" = any($1) and l."userId" <> all($2)`),
      flags: await count(`select count(*)::int as n from "QuestionFlag" where "questionId" = any($1) and "flaggedById" <> all($2)`),
      favourites: await count(`select count(*)::int as n from "TeacherFavorite" where "questionId" = any($1) and "teacherId" <> all($2)`),
    };
    console.log('referred to by anyone else:', foreign);
    if (Object.values(foreign).some((n) => n > 0)) {
      console.log('Stopping: real users refer to some of these questions. Nothing was removed.');
      process.exitCode = 1;
      return;
    }
    if (!APPLY) { console.log('\nPreview only. Re-run with --apply to remove them.'); return; }

    const backup = {
      questions: (await client.query(`select * from "Question" where "id" = any($1)`, [ids])).rows,
      solutions: (await client.query(`select * from "Solution" where "questionId" = any($1)`, [ids])).rows,
      versions: (await client.query(`select * from "QuestionVersion" where "questionId" = any($1)`, [ids])).rows,
      tags: (await client.query(`select * from "QuestionTag" where "questionId" = any($1)`, [ids])).rows,
    };
    mkdirSync('qa-backups', { recursive: true });
    const file = `qa-backups/e2e-questions-live-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`backup written: ${file}`);

    await client.query('begin');
    try {
      // The e2e accounts' own work that points at these questions; their tests cascade to sections, slots,
      // assignments, attempts and answers.
      const removed: Record<string, number> = {};
      // Each statement gets only the parameters it uses ($1 question ids, $2 account ids): Postgres cannot type an
      // unused one, so a statement that needs only the accounts has its $2 renumbered to $1.
      const run = async (label: string, sql: string) => {
        const usesQuestions = sql.includes('$1');
        const result = await client.query(usesQuestions ? sql : sql.replace(/\$2/g, '$1'), usesQuestions ? [ids, accountIds] : [accountIds]);
        removed[label] = result.rowCount ?? 0;
      };
      await run('tests', `delete from "Test" where "createdById" = any($2)`);
      await run('attempts', `delete from "TestAttempt" where "userId" = any($2)`);
      await run('reviewCards', `delete from "SpacedRepetitionCard" where "questionId" = any($1) and "userId" = any($2)`);
      await run('masteryEvents', `delete from "MasteryEvent" where "questionId" = any($1) and "userId" = any($2)`);
      await run('notebook', `delete from "MistakeNotebookEntry" where "questionId" = any($1) and "userId" = any($2)`);
      await run('bookmarks', `delete from "BookmarkItem" where "questionId" = any($1) and "listId" in (select "id" from "BookmarkList" where "userId" = any($2))`);
      await run('flags', `delete from "QuestionFlag" where "questionId" = any($1) and "flaggedById" = any($2)`);
      // Solutions, versions, tags, images and figures cascade with the question.
      await run('questions', `delete from "Question" where "id" = any($1) and "createdById" = any($2)`);
      await client.query('commit');
      console.log('removed:', removed);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error((error as Error).message); process.exit(1); });

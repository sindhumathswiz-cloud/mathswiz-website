import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

/**
 * Product decision (22 Sep 2026): send the second-review-verified question
 * backlog to Codex (an independent model, run outside this app) for
 * confirmation, rather than auto-approving MATHEMATICALLY_VERIFIED
 * questions directly -- per the standing no-second-model-workflow rule,
 * this codebase's own pipeline shouldn't self-confirm its own AI
 * verification pass.
 *
 * Exports every question currently MATHEMATICALLY_VERIFIED and NOT yet
 * APPROVED (still held, per that rule) with FULL content -- the original
 * 13 Sep export (_second_review_export/ready_for_codex_confirmation.csv)
 * only carried metadata (id/status/topic/type), not the actual question
 * text/options/answer, so it wasn't self-contained enough for an
 * independent reviewer with no separate DB access to actually check.
 *
 * This does NOT transmit anything anywhere -- there is no Codex connector
 * available in this environment. It writes a self-contained JSON file the
 * user hands to their own Codex session/tool.
 *
 * Runs via plain `pg`, not the app's Prisma singleton -- see
 * scripts/sweep-approved-gates.ts for why.
 *
 * Usage: npx tsx scripts/export-codex-verification.ts
 */

interface Row {
  id: string;
  content: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string | null;
  type: string;
  topic: string | null;
  subTopic: string | null;
  provenance: string;
  bookId: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  printedNumber: string | null;
  reviewNotes: string | null;
  currentVersion: number;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<Row>(`
      SELECT q.id, q.content, q.options, q."correctAnswer", q.explanation, q.type,
             q.topic, q."subTopic", q.provenance, q."bookId",
             q."sourcePageStart", q."sourcePageEnd", q."printedNumber",
             q."reviewNotes", q."currentVersion"
      FROM "Question" q
      WHERE q."verificationStatus" = 'MATHEMATICALLY_VERIFIED' AND q.status != 'APPROVED'
      ORDER BY q."bookId" NULLS LAST, q."sourcePageStart" NULLS LAST, q.id
    `);

    const bookIds = [...new Set(rows.map((r) => r.bookId).filter((b): b is string => b != null))];
    const { rows: books } = bookIds.length === 0
      ? { rows: [] as Array<{ id: string; title: string; className: string }> }
      : await client.query<{ id: string; title: string; className: string }>(
          `SELECT id, title, "className" FROM "Book" WHERE id = ANY($1)`,
          [bookIds]
        );
    const bookById = new Map(books.map((b) => [b.id, b]));

    const questions = rows.map((r) => {
      const book = r.bookId ? bookById.get(r.bookId) : undefined;
      return {
        id: r.id,
        source: book ? `${book.title} (${book.className})` : 'Non-book',
        sourcePage: r.sourcePageStart != null
          ? (r.sourcePageStart === r.sourcePageEnd ? `p.${r.sourcePageStart}` : `pp.${r.sourcePageStart}-${r.sourcePageEnd}`)
          : null,
        printedNumber: r.printedNumber,
        topic: r.topic,
        subTopic: r.subTopic,
        type: r.type,
        content: r.content,
        options: Array.isArray(r.options) ? r.options : null,
        correctAnswer: r.correctAnswer,
        explanation: r.explanation,
        priorReviewNotes: r.reviewNotes,
      };
    });

    const outDir = path.resolve(__dirname, '../_second_review_export');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `codex_verification_${new Date().toISOString().slice(0, 10)}.json`);

    fs.writeFileSync(outPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      instructions:
        "Each entry was independently marked MATHEMATICALLY_VERIFIED by this app's own AI re-derivation pass " +
        "(a separate model re-solves the problem from `content`/`options` and checks it against `correctAnswer`/`explanation`), " +
        "but per this project's no-second-model-workflow rule, that verification isn't trusted enough on its own to auto-approve -- " +
        "it needs confirmation from a genuinely independent reviewer (Codex) before being approved for students. " +
        "For each question: independently re-derive the answer from `content`/`options` (ignore `correctAnswer`/`explanation` while solving), " +
        "then compare. Report back per-id as CONFIRMED (matches), INCORRECT (does not match -- state the correct answer and why), " +
        "or UNCERTAIN (insufficient information / ambiguous as stated). Do not fabricate or guess when insufficient information is given.",
      count: questions.length,
      questions,
    }, null, 2));

    console.log(`Exported ${questions.length} MATHEMATICALLY_VERIFIED, not-yet-APPROVED question(s) to:`);
    console.log(outPath);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

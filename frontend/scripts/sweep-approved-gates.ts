import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';
import { provenanceApprovalError, type ApprovableQuestion } from '../src/lib/question-provenance';
import { structuralApprovalError, type QAQuestion } from '../src/lib/question-qa';
import { evaluateFigureContext } from '../src/lib/question-figures';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

/**
 * One-time retroactive sweep (product decision, 22 Sep 2026): the
 * provenance / structural QA / figure approval gates (Issues 7-9) only ever
 * blocked *future* transitions into APPROVED -- nothing re-checked a
 * question that was approved before a given gate existed. This reads every
 * currently-APPROVED question, runs it through the exact same three gate
 * functions the live approval path uses, and TAGS (does not un-approve or
 * archive) any that would fail today -- per the decision, this is a flag
 * for human review, not an automatic downgrade of live content that may be
 * sitting inside already-assigned tests.
 *
 * Runs via plain `pg` rather than the app's own Prisma client singleton
 * (src/lib/prisma.ts, which uses @prisma/adapter-pg) -- standalone scripts
 * importing that singleton reproducibly fail with ECONNREFUSED in this
 * environment even with correct env vars loaded (not a real network
 * restriction; established workaround from earlier in this project).
 *
 * Usage: npx tsx scripts/sweep-approved-gates.ts [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');
const SWEEP_TAG = 'Gate-Swept: Flagged';

interface Row {
  id: string;
  content: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string | null;
  type: string;
  provenance: ApprovableQuestion['provenance'];
  bookId: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  printedNumber: string | null;
  tags: string[];
  reviewNotes: string | null;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<Row>(`
      SELECT id, content, options, "correctAnswer", explanation, type, provenance,
             "bookId", "sourcePageStart", "sourcePageEnd", "printedNumber", tags, "reviewNotes"
      FROM "Question"
      WHERE status = 'APPROVED'
    `);
    console.log(`Scanned ${rows.length} APPROVED question(s).`);

    const ids = rows.map((r) => r.id);
    const bookIds = [...new Set(rows.map((r) => r.bookId).filter((b): b is string => b != null))];

    const { rows: linkedFigureRows } = ids.length === 0
      ? { rows: [] as Array<{ questionId: string; reviewedAt: Date | null; matchedAutomatically: boolean }> }
      : await client.query<{ questionId: string; reviewedAt: Date | null; matchedAutomatically: boolean }>(
          `SELECT "questionId", "reviewedAt", "matchedAutomatically" FROM "PageFigure" WHERE "questionId" = ANY($1)`,
          [ids]
        );
    const { rows: unresolvedFigureRows } = bookIds.length === 0
      ? { rows: [] as Array<{ bookId: string; pageNumber: number }> }
      : await client.query<{ bookId: string; pageNumber: number }>(
          `SELECT "bookId", "pageNumber" FROM "PageFigure" WHERE "bookId" = ANY($1) AND "questionId" IS NULL AND "reviewedAt" IS NULL`,
          [bookIds]
        );

    const linkedByQuestion = new Map<string, Array<{ reviewedAt: Date | null; matchedAutomatically: boolean }>>();
    for (const r of linkedFigureRows) {
      const list = linkedByQuestion.get(r.questionId) ?? [];
      list.push({ reviewedAt: r.reviewedAt, matchedAutomatically: r.matchedAutomatically });
      linkedByQuestion.set(r.questionId, list);
    }
    const unresolvedByBook = new Map<string, number[]>();
    for (const r of unresolvedFigureRows) {
      const list = unresolvedByBook.get(r.bookId) ?? [];
      list.push(r.pageNumber);
      unresolvedByBook.set(r.bookId, list);
    }

    const flagged: Array<{ id: string; blockers: string[] }> = [];

    for (const q of rows) {
      const blockers: string[] = [];

      const provenanceReason = provenanceApprovalError({
        provenance: q.provenance,
        bookId: q.bookId,
        sourcePageStart: q.sourcePageStart,
        sourcePageEnd: q.sourcePageEnd,
        printedNumber: q.printedNumber,
      });
      if (provenanceReason) blockers.push(provenanceReason);

      const structuralReason = structuralApprovalError({
        content: q.content,
        options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
        correctAnswer: q.correctAnswer ?? undefined,
        explanation: q.explanation ?? undefined,
        type: q.type,
      } as QAQuestion);
      if (structuralReason) blockers.push(structuralReason);

      if (q.bookId && q.sourcePageStart != null && q.sourcePageEnd != null) {
        const unresolvedOnPagePages = (unresolvedByBook.get(q.bookId) ?? [])
          .filter((page) => page >= q.sourcePageStart! && page <= q.sourcePageEnd!);
        const figureReason = evaluateFigureContext(
          { content: q.content, explanation: q.explanation },
          { linkedFigures: linkedByQuestion.get(q.id) ?? [], unresolvedOnPagePages }
        );
        if (figureReason) blockers.push(figureReason);
      }

      if (blockers.length > 0) flagged.push({ id: q.id, blockers });
    }

    console.log(`${flagged.length} of ${rows.length} APPROVED question(s) would fail today's gates.`);

    if (DRY_RUN) {
      const codeCounts = new Map<string, number>();
      for (const f of flagged) {
        for (const b of f.blockers) {
          const codes = [...b.matchAll(/\(([A-Z_]+(?:, [A-Z_]+)*)\)/g)].flatMap((m) => m[1].split(', '));
          const key = codes.length > 0 ? codes.join(',') : (b.startsWith('Question text references') || b.includes('linked figure') || b.includes('unmatched figure') ? 'FIGURE_GATE' : b.startsWith('Book-sourced') ? 'PROVENANCE' : 'OTHER');
          for (const k of key.split(',')) codeCounts.set(k, (codeCounts.get(k) ?? 0) + 1);
        }
      }
      console.log('Breakdown by blocker code (a question can carry more than one):');
      for (const [code, count] of [...codeCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${code}: ${count}`);
      }
      for (const f of flagged.slice(0, 20)) {
        console.log(`  ${f.id}: ${f.blockers.join(' | ')}`);
      }
      if (flagged.length > 20) console.log(`  ... and ${flagged.length - 20} more`);
      console.log('Dry run -- no writes made.');
      return;
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const swept = new Date().toISOString().slice(0, 10);
    let updated = 0;
    for (const f of flagged) {
      const row = byId.get(f.id)!;
      const nextTags = row.tags.includes(SWEEP_TAG) ? row.tags : [...row.tags, SWEEP_TAG];
      const note = [
        `[Gate-Swept -- ${swept}]`,
        `This question was approved before today's approval gates existed and would fail them now:`,
        ...f.blockers.map((b) => `- ${b}`),
        `Status left as APPROVED (this is a flag for review, not an automatic downgrade). Resolve via the review queue once corrected, or archive if it can't be fixed.`,
      ].join('\n');
      const nextNotes = row.reviewNotes ? `${row.reviewNotes}\n\n${note}` : note;

      await client.query(
        `UPDATE "Question" SET tags = $1, "reviewNotes" = $2 WHERE id = $3`,
        [nextTags, nextNotes, f.id]
      );
      updated++;
    }

    const { rows: adminRows } = await client.query<{ id: string }>(
      `SELECT id FROM "User" WHERE email = $1 AND role = 'ADMIN' LIMIT 1`,
      ['sindhu.mathswiz@gmail.com']
    );
    await client.query(
      `INSERT INTO "AuditLog" (id, "actorId", "actorRole", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'ADMIN', 'QUESTION_APPROVAL_GATE_SWEEP', 'Question', NULL, $3, now())`,
      [randomUUID(), adminRows[0]?.id ?? null, JSON.stringify({ scanned: rows.length, flagged: flagged.length, tag: SWEEP_TAG })]
    );

    console.log(`Tagged and audit-logged ${updated} question(s) with "${SWEEP_TAG}". Done.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

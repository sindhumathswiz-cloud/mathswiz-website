/**
 * Rectifies what can be rectified among questions in REPORTED (default) or DRAFT status, without inventing anything.
 *
 *   npx tsx scripts/rectify-reported-questions.ts            dry run: prints the plan, writes nothing
 *   npx tsx scripts/rectify-reported-questions.ts --apply    applies it (backup first)
 *   add --status=DRAFT to work on the review queue instead of the reported questions
 *
 * What it does:
 *   1. DUPLICATES  A REPORTED question whose text is the same as another question is archived, keeping the
 *                  better copy (APPROVED, then DRAFT, then the most complete). Nothing is deleted.
 *   2. UNRECOVERABLE  A multiple-choice question with no options, whose options are not in its original
 *                  text either, is archived with the reason (it needs re-extracting from the source).
 *   3. LATEX       Broken LaTeX is repaired mechanically (stray $, swallowed backslashes, unmatched
 *                  \left/\right). A repair is kept only if everything then renders and nothing but
 *                  delimiters and escapes changed.
 *   4. REQUEUE     A question with no QA issue left goes back to DRAFT for ordinary review.
 *
 * What it never does: write an answer, an explanation or an option; approve anything; delete anything.
 * Questions still missing an answer, explanation or options stay REPORTED, with a note saying so.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyzeQuestion } from '../src/lib/question-qa';
import { repairLatexField } from '../src/lib/latex-repair';
import { answerFromSolution, splitInlineOptions } from '../src/lib/choice-recovery';
import { computeContentHash } from '../src/lib/question-classifier';

config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const STATUS = (process.argv.find((a) => a.startsWith('--status='))?.split('=')[1] ?? 'REPORTED') as 'REPORTED' | 'DRAFT';
if (STATUS !== 'REPORTED' && STATUS !== 'DRAFT') throw new Error('--status must be REPORTED or DRAFT');
// Questions an extraction is still writing (and de-duplicating) are left alone for a while.
const RECENT_CUTOFF = new Date(Date.now() - 30 * 60 * 1000);
const TODAY = new Date().toISOString().slice(0, 10);
const MCQ = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);

type Row = {
  id: string; type: string; content: string; options: unknown; correctAnswer: string | null; explanation: string | null;
  status: string; contentHash: string | null; createdAt: Date; originalRawText: string | null; reviewNotes: string | null;
  tags: string[]; difficulty: string; topic: string | null; subTopic: string | null; currentVersion: number;
};

const optionsOf = (row: Row): string[] => (Array.isArray(row.options) ? (row.options as unknown[]).map(String) : []);
const qaOf = (row: { type: string; content: string; correctAnswer: string | null; explanation: string | null }, options: string[]) =>
  analyzeQuestion({ content: row.content, options, correctAnswer: row.correctAnswer ?? '', explanation: row.explanation ?? '', type: row.type });

/** Options written inline in the text ("(a) ... (b) ..." or "A. ... B. ...") mean the options may be recoverable by hand. */
const hasInlineOptions = (text: string) => /(^|\s)\(\s*[aA]\s*\)[\s\S]*\(\s*[bB]\s*\)/.test(text) || /(^|\n)\s*[A-D][.)]\s+\S[\s\S]*\n\s*[B-D][.)]\s+\S/.test(text);

/** Higher is a better copy to keep. */
function keeperScore(row: Row): number {
  const options = optionsOf(row);
  const issues = qaOf(row, options);
  const status = row.status === 'APPROVED' ? 1000 : row.status === 'DRAFT' ? 500 : 0;
  return status
    + (row.correctAnswer?.trim() ? 40 : 0) + ((row.explanation ?? '').trim().length >= 5 ? 40 : 0)
    + (MCQ.has(row.type) && options.length >= 2 ? 40 : 0) - issues.filter((i) => i.severity === 'error').length * 20 - issues.length * 5;
}

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const select = {
    id: true, type: true, content: true, options: true, correctAnswer: true, explanation: true, status: true, contentHash: true,
    createdAt: true, originalRawText: true, reviewNotes: true, tags: true, difficulty: true, topic: true, subTopic: true, currentVersion: true,
  } as const;

  const reported = (await prisma.question.findMany({ where: { status: STATUS, ...(STATUS === 'DRAFT' ? { createdAt: { lt: RECENT_CUTOFF } } : {}) }, select, orderBy: { createdAt: 'asc' } })) as unknown as Row[];
  const hashes = [...new Set(reported.map((r) => r.contentHash).filter((h): h is string => !!h))];
  const twins = hashes.length ? (await prisma.question.findMany({ where: { contentHash: { in: hashes }, status: { not: 'ARCHIVED' } }, select })) as unknown as Row[] : [];
  const byHash = new Map<string, Row[]>();
  for (const row of twins) {
    if (!row.contentHash) continue;
    byHash.set(row.contentHash, [...(byHash.get(row.contentHash) ?? []), row]);
  }

  type Action = { id: string; kind: 'ARCHIVE_DUPLICATE' | 'ARCHIVE_UNRECOVERABLE' | 'REPAIR'; note: string; keeperId?: string; patch?: { content?: string; options?: string[]; explanation?: string; correctAnswer?: string; type?: string }; fixes?: string[]; recovered?: string[]; requeue?: boolean; remaining?: string[] };
  const actions: Action[] = [];
  const claimed = new Set<string>();

  // 1. duplicates
  for (const row of reported) {
    const group = row.contentHash ? byHash.get(row.contentHash) ?? [] : [];
    if (group.length < 2) continue;
    const keeper = [...group].sort((a, b) => keeperScore(b) - keeperScore(a) || a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (keeper.id === row.id) continue;
    claimed.add(row.id);
    actions.push({ id: row.id, kind: 'ARCHIVE_DUPLICATE', keeperId: keeper.id, note: `Duplicate of ${keeper.id} (${keeper.status}); the other copy is the one kept. Archived, not deleted.` });
  }

  // 2. unrecoverable multiple-choice questions
  for (const row of reported) {
    if (STATUS !== 'REPORTED') continue; // a draft is still in review; do not archive it, retype it where the evidence allows
    if (claimed.has(row.id) || !MCQ.has(row.type) || optionsOf(row).filter((o) => o.trim()).length >= 2) continue;
    if (hasInlineOptions(row.content) || hasInlineOptions(row.originalRawText ?? '')) continue; // may be recoverable by hand
    claimed.add(row.id);
    actions.push({ id: row.id, kind: 'ARCHIVE_UNRECOVERABLE', note: 'Multiple-choice question with no options, and the options are not in its original text either (the import mixed this question with another one\'s working). It cannot be repaired without inventing content; re-extract it from the source. Archived, not deleted.' });
  }

  // 3 + 4. Recover misplaced options, repair LaTeX, recover an answer the printed solution states, then requeue those left clean
  for (const row of reported) {
    if (claimed.has(row.id)) continue;
    const originalOptions = optionsOf(row);
    const recovered: string[] = [];

    // options written inline in the question text
    let content = row.content;
    let options = originalOptions;
    if (MCQ.has(row.type) && options.filter((o) => o.trim()).length < 2) {
      const split = splitInlineOptions(content);
      if (split) { content = split.stem; options = split.options; recovered.push('options moved out of the question text'); }
    }

    // A question typed INTEGER whose stored answer is not a number cannot be answered as typed: the exam
    // screen only accepts digits. The answer proves the real type.
    let type = row.type;
    const storedAnswer = (row.correctAnswer ?? '').trim();
    const isNumber = /^[+-]?\d*\.?\d+$/.test(storedAnswer.replace(/\s/g, ''));
    if (row.type === 'INTEGER' && storedAnswer && !isNumber) {
      if (options.filter((o) => o.trim()).length >= 2 && /^[A-Da-d]$/.test(storedAnswer) && storedAnswer.toUpperCase().charCodeAt(0) - 65 < options.length) {
        type = 'SINGLE_CHOICE';
        recovered.push('retyped INTEGER to SINGLE_CHOICE: it has options and a letter answer, so it is a multiple-choice question');
      } else if (options.filter((o) => o.trim()).length === 0) {
        type = 'SHORT_ANSWER';
        recovered.push('retyped INTEGER to SHORT_ANSWER: its answer is an expression, not a whole number, so it could never be entered on a numerical question');
      }
    }
    if (MCQ.has(row.type) && options.filter((o) => o.trim()).length < 2 && storedAnswer && !/^\(?[A-Da-d]\)?[.):]?$/.test(storedAnswer) && !hasInlineOptions(content)) {
      type = 'SHORT_ANSWER';
      recovered.push('retyped ' + row.type + ' to SHORT_ANSWER: it has no options and its answer is a value, not an option letter');
    }
    const c = repairLatexField(content);
    const e = repairLatexField(row.explanation ?? '');
    const o = options.map(repairLatexField);
    const patchedOptions = o.map((r) => r.text);

    // an answer the printed solution itself states (exactly one option equals its final result)
    let correctAnswer = row.correctAnswer ?? '';
    if (MCQ.has(row.type) && !correctAnswer.trim() && patchedOptions.length >= 2 && e.text.trim()) {
      const letter = answerFromSolution(patchedOptions, e.text);
      if (letter) { correctAnswer = letter; recovered.push(`answer ${letter} taken from the printed solution's final result, which matches option ${letter} exactly`); }
    }

    const optionsChanged = o.some((r) => r.changed) || options !== originalOptions;
    const typeChanged = type !== row.type;
    const contentChanged = c.changed || content !== row.content;
    const answerChanged = correctAnswer !== (row.correctAnswer ?? '');
    const anyChange = contentChanged || e.changed || optionsChanged || answerChanged || typeChanged;
    const after = qaOf({ ...row, type, content: c.text, explanation: e.text, correctAnswer }, patchedOptions);
    const before = qaOf(row, originalOptions);
    if (!anyChange && before.length === 0) continue;
    const fixes = [...new Set([...c.fixes, ...e.fixes, ...o.flatMap((r) => r.fixes)])];
    const remaining = [...new Set(after.map((i) => i.code))];
    actions.push({
      id: row.id, kind: 'REPAIR', note: '', fixes, recovered, remaining, requeue: remaining.length === 0,
      ...(anyChange ? { patch: {
        ...(contentChanged ? { content: c.text } : {}),
        ...(e.changed ? { explanation: e.text } : {}),
        ...(optionsChanged ? { options: patchedOptions } : {}),
        ...(answerChanged ? { correctAnswer } : {}),
        ...(typeChanged ? { type } : {}),
      } } : {}),
    });
  }

  // summary
  const count = (k: Action['kind']) => actions.filter((a) => a.kind === k).length;
  const repairs = actions.filter((a) => a.kind === 'REPAIR');
  const summary = {
    status: STATUS,
    questions: reported.length,
    archiveDuplicates: count('ARCHIVE_DUPLICATE'),
    archiveUnrecoverable: count('ARCHIVE_UNRECOVERABLE'),
    questionsChanged: repairs.filter((a) => a.patch).length,
    retyped: repairs.filter((a) => a.patch?.type).length,
    optionsMovedOutOfText: repairs.filter((a) => a.recovered?.some((r) => r.startsWith('options'))).length,
    answersFromPrintedSolution: repairs.filter((a) => a.recovered?.some((r) => r.startsWith('answer'))).length,
    cleanAfterRepair: repairs.filter((a) => a.requeue).length,
    stillHaveIssues: reported.length - count('ARCHIVE_DUPLICATE') - count('ARCHIVE_UNRECOVERABLE') - repairs.filter((a) => a.requeue).length,
  };
  console.log(JSON.stringify(summary, null, 1));
  const remainingCounts = new Map<string, number>();
  for (const a of repairs) for (const code of a.remaining ?? []) if (!a.requeue) remainingCounts.set(code, (remainingCounts.get(code) ?? 0) + 1);
  console.log('still blocking (questions per issue):', [...remainingCounts.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v}`).join('  '));

  writeFileSync('rectify-plan.json', JSON.stringify({ summary, actions }, null, 1));
  if (!APPLY) { console.log('\nDry run only. Plan written to rectify-plan.json. Re-run with --apply to make these changes.'); process.exit(0); }

  // ---- apply ----
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!admin) throw new Error('No admin user to attribute version history to');
  const byId = new Map(reported.map((r) => [r.id, r]));
  mkdirSync('qa-backups', { recursive: true });
  const backupPath = `qa-backups/rectify-${STATUS.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), questions: actions.map((a) => byId.get(a.id)) }, null, 1));
  console.log('backup', backupPath, actions.length, 'questions');

  let done = 0;
  for (const a of actions) {
    const row = byId.get(a.id)!;
    const fresh = await prisma.question.findUnique({ where: { id: a.id }, select: { status: true, content: true, explanation: true, options: true, currentVersion: true, reviewNotes: true } });
    if (!fresh || fresh.status !== STATUS || fresh.content !== row.content || (fresh.explanation ?? '') !== (row.explanation ?? '')) { console.log('skip (changed since the plan)', a.id); continue; }

    const prepend = (note: string) => `${note}\n\n${fresh.reviewNotes ?? ''}`.trim().slice(0, 6000);
    if (a.kind === 'ARCHIVE_DUPLICATE' || a.kind === 'ARCHIVE_UNRECOVERABLE') {
      await prisma.$transaction(async (tx) => {
        await tx.question.update({ where: { id: a.id }, data: { status: 'ARCHIVED', reviewNotes: prepend(`[Rectification pass ${TODAY}] ${a.note}`) } });
        await tx.auditLog.create({ data: { actorRole: 'SYSTEM', action: 'QUESTION_ARCHIVED_BY_RECTIFICATION', entityType: 'Question', entityId: a.id, metadata: { reason: a.kind, keeperId: a.keeperId ?? null, previousStatus: STATUS, backupPath } } });
      });
    } else {
      const parts: string[] = [];
      if (a.fixes?.length) parts.push(`LaTeX repaired mechanically (${a.fixes.join('; ')}); no wording changed.`);
      for (const r of a.recovered ?? []) parts.push(`${r.charAt(0).toUpperCase()}${r.slice(1)}. Check it against the source.`);
      parts.push(a.requeue ? (STATUS === 'REPORTED' ? 'No QA issues remain; returned to the review queue as DRAFT (not approved).' : 'No QA issues remain; ready for ordinary review (not approved).') : `Still blocked by: ${(a.remaining ?? []).join(', ')}. Nothing was invented to fill the gaps.`);
      const note = `[Rectification pass ${TODAY}] ${parts.join(' ')}`;
      await prisma.$transaction(async (tx) => {
        if (a.patch) {
          await tx.questionVersion.create({ data: {
            questionId: a.id, version: fresh.currentVersion, content: row.content, options: (row.options ?? undefined) as never, correctAnswer: row.correctAnswer, explanation: row.explanation,
            type: row.type, difficulty: row.difficulty, topic: row.topic, subTopic: row.subTopic, tags: row.tags, changedBy: admin.id, changeReason: 'Rectification pass: mechanical repair (LaTeX, misplaced options, answer stated by the printed solution)',
          } });
        }
        await tx.question.update({ where: { id: a.id }, data: {
          ...(a.patch?.content !== undefined ? { content: a.patch.content, contentHash: computeContentHash(a.patch.content) } : {}),
          ...(a.patch?.explanation !== undefined ? { explanation: a.patch.explanation } : {}),
          ...(a.patch?.options !== undefined ? { options: a.patch.options } : {}),
          ...(a.patch?.correctAnswer !== undefined ? { correctAnswer: a.patch.correctAnswer } : {}),
          ...(a.patch?.type !== undefined ? { type: a.patch.type as never } : {}),
          ...(a.patch ? { currentVersion: { increment: 1 } } : {}),
          ...(a.requeue && STATUS === 'REPORTED' ? { status: 'DRAFT' as const } : {}),
          reviewNotes: prepend(note),
        } });
        await tx.auditLog.create({ data: { actorRole: 'SYSTEM', action: 'QUESTION_RECTIFIED', entityType: 'Question', entityId: a.id, metadata: { fixes: a.fixes ?? [], recovered: a.recovered ?? [], requeued: !!a.requeue, remaining: a.remaining ?? [], backupPath } } });
      });
    }
    done++;
    if (done % 50 === 0) console.log('progress', done, '/', actions.length);
  }
  console.log('applied', done, 'of', actions.length);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });

/**
 * Recovers missing answers, explanations and options for REPORTED and DRAFT questions from another copy
 * of the same question that was extracted from a printed book. Nothing is written by a model.
 *
 *   npx tsx scripts/recover-from-source-copies.ts           dry run: prints what it would do
 *   npx tsx scripts/recover-from-source-copies.ts --apply   does it (backup first)
 *
 * For each question with a gap, the best book copy (text similarity of 0.90 or more) is found. Then:
 *   - a question that is not linked to any book and has a book copy that is at least as complete is
 *     ARCHIVED as superseded (the book copy keeps the evidence: book, page, printed number);
 *   - otherwise the gaps are FILLED from the book copy (fill-only: an existing answer, explanation or
 *     option is never overwritten), and the note cites the book and page.
 * Multiple-choice answers are carried over by option text, not letter, so a shuffled option order
 * cannot give the wrong letter.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyzeQuestion } from '../src/lib/question-qa';
import { MatchIndex, sameNumbers, toMatchable, type Matchable } from '../src/lib/question-match';
import { parseQuestionOptions, resolveCorrectOptionIndex } from '../src/lib/arena-answer';

config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const THRESHOLD = 0.9;
const TODAY = new Date().toISOString().slice(0, 10);
const RECENT_CUTOFF = new Date(Date.now() - 30 * 60 * 1000);
const MCQ = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);
const OBJECTIVE = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE']);
const PLACEHOLDER = /try\s+(it\s+)?yourself|do\s+(it\s+)?yourself|similar to (the above|q\.?\s*no|question|previous)|refer to (the )?(above|previous|q\b)|same as (the )?(above|q\b)|left as an exercise|as in q\.?\s*no/i;

type Row = {
  id: string; type: string; content: string; options: unknown; correctAnswer: string | null; explanation: string | null; status: string;
  bookId: string | null; sourcePageStart: number | null; printedNumber: string | null; reviewNotes: string | null; tags: string[];
  difficulty: string; topic: string | null; subTopic: string | null; currentVersion: number; book?: { title: string } | null;
};

const optionText = (value: string) => value.toLowerCase().replace(/\\(?:left|right)(?![a-z])/g, '').replace(/[\s$]/g, '');
const optionsOf = (row: Row) => parseQuestionOptions(row.options);
const issuesOf = (row: { type: string; content: string; correctAnswer: string | null; explanation: string | null }, options: string[]) =>
  analyzeQuestion({ content: row.content, options, correctAnswer: row.correctAnswer ?? '', explanation: row.explanation ?? '', type: row.type });

type Gain = { answer?: string; explanation?: string; options?: string[]; type?: string };

/** What the source copy B can give to D, by D's own gaps. */
function gainsFrom(d: Row, b: Row): Gain {
  const gain: Gain = {};
  const dOptions = optionsOf(d);
  const bOptions = optionsOf(b);
  if (MCQ.has(d.type) !== MCQ.has(b.type)) return gain;

  if (MCQ.has(d.type) && dOptions.length < 2 && bOptions.length >= 2) gain.options = bOptions;
  const effectiveOptions = gain.options ?? dOptions;

  if (OBJECTIVE.has(d.type) && !(d.correctAnswer ?? '').trim() && (b.correctAnswer ?? '').trim()) {
    if (MCQ.has(d.type)) {
      const bIndex = resolveCorrectOptionIndex(b.correctAnswer, bOptions);
      if (bIndex >= 0 && effectiveOptions.length >= 2) {
        if (gain.options) gain.answer = String.fromCharCode(65 + bIndex); // same options, same order
        else {
          const target = optionText(bOptions[bIndex]);
          const matches = effectiveOptions.map((o, i) => (optionText(o) === target ? i : -1)).filter((i) => i >= 0);
          if (matches.length === 1) gain.answer = String.fromCharCode(65 + matches[0]); // by text, so a shuffled order is safe
        }
      }
    } else {
      gain.answer = (b.correctAnswer ?? '').trim();
      // A numerical question whose printed answer is an expression (1/2, pi/4) cannot be answered on the numeric screen.
      if (d.type === 'INTEGER' && !/^[+-]?\d*\.?\d+$/.test(gain.answer.replace(/\s/g, ''))) gain.type = 'SHORT_ANSWER';
    }
  }
  const bExplanation = (b.explanation ?? '').trim();
  if ((d.explanation ?? '').trim().length < 5 && bExplanation.length >= 5 && !PLACEHOLDER.test(bExplanation)) gain.explanation = bExplanation;
  return gain;
}

const hasGain = (g: Gain) => !!(g.answer || g.explanation || g.options);

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const select = {
    id: true, type: true, content: true, options: true, correctAnswer: true, explanation: true, status: true, bookId: true, sourcePageStart: true,
    printedNumber: true, reviewNotes: true, tags: true, difficulty: true, topic: true, subTopic: true, currentVersion: true, book: { select: { title: true } },
  } as const;

  const pool = (await prisma.question.findMany({ where: { bookId: { not: null }, status: { not: 'ARCHIVED' } }, select })) as unknown as Row[];
  const targets = (await prisma.question.findMany({ where: { status: { in: ['REPORTED', 'DRAFT'] }, createdAt: { lt: RECENT_CUTOFF } }, select })) as unknown as Row[];
  const byId = new Map(pool.map((q) => [q.id, q]));
  const index = new MatchIndex(pool.map((q) => toMatchable(q.id, q.content)));

  type Action = { id: string; kind: 'ARCHIVE_SUPERSEDED' | 'FILL'; sourceId: string; score: number; gain: Gain; note: string };
  const actions: Action[] = [];
  let withGap = 0;

  for (const d of targets) {
    const dOptions = optionsOf(d);
    const gaps = (OBJECTIVE.has(d.type) && !(d.correctAnswer ?? '').trim()) || (d.explanation ?? '').trim().length < 5 || (MCQ.has(d.type) && dOptions.length < 2);
    if (!gaps) continue;
    withGap++;
    const hit = index.best(toMatchable(d.id, d.content) as Matchable, THRESHOLD, d.id);
    if (!hit) continue;
    const b = byId.get(hit.entry.id);
    if (!b || b.id === d.id || !sameNumbers(d.content, b.content)) continue;
    // A source copy that is itself broken is no help.
    if (issuesOf(b, optionsOf(b)).some((i) => i.severity === 'error')) continue;
    const gain = gainsFrom(d, b);
    if (!hasGain(gain)) continue;
    const where = `${b.book?.title ?? 'a book'}${b.sourcePageStart ? `, p.${b.sourcePageStart}` : ''}${b.printedNumber ? `, no. ${b.printedNumber}` : ''}`;

    // Is the source copy at least as complete as D (so nothing is lost by archiving D)?
    const bOptions = optionsOf(b);
    const supersedes = (!(d.correctAnswer ?? '').trim() || !!(b.correctAnswer ?? '').trim())
      && ((d.explanation ?? '').trim().length < 5 || (b.explanation ?? '').trim().length >= 5)
      && (!MCQ.has(d.type) || dOptions.length < 2 || bOptions.length >= 2);
    if (!d.bookId && supersedes) {
      actions.push({ id: d.id, kind: 'ARCHIVE_SUPERSEDED', sourceId: b.id, score: hit.score, gain, note: `Superseded by question ${b.id} (${where}), the copy extracted from the printed book, which holds the answer/solution and the source page. Text match ${hit.score.toFixed(2)}. Archived, not deleted.` });
    } else {
      const copied = [gain.options && 'options', gain.answer && 'answer', gain.explanation && 'explanation'].filter(Boolean).join(', ');
      actions.push({ id: d.id, kind: 'FILL', sourceId: b.id, score: hit.score, gain, note: `Recovered from the printed book: ${copied} copied from question ${b.id} (${where}), text match ${hit.score.toFixed(2)}. Nothing was written by a model. Check it against the source.` });
    }
  }

  const count = (k: Action['kind']) => actions.filter((a) => a.kind === k).length;
  const sources = new Map<string, number>();
  for (const a of actions) { const t = byId.get(a.sourceId)?.book?.title ?? '?'; sources.set(t, (sources.get(t) ?? 0) + 1); }
  console.log(JSON.stringify({
    candidatesWithAGap: withGap,
    matchedToABookCopy: actions.length,
    archiveSuperseded: count('ARCHIVE_SUPERSEDED'),
    filled: count('FILL'),
    answersRecovered: actions.filter((a) => a.gain.answer).length,
    explanationsRecovered: actions.filter((a) => a.gain.explanation).length,
    optionsRecovered: actions.filter((a) => a.gain.options).length,
    fromBook: Object.fromEntries(sources),
  }, null, 1));
  writeFileSync('recover-plan.json', JSON.stringify({ actions }, null, 1));
  if (!APPLY) { console.log('Dry run only. Plan in recover-plan.json. Re-run with --apply.'); process.exit(0); }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!admin) throw new Error('No admin user to attribute version history to');
  const targetById = new Map(targets.map((t) => [t.id, t]));
  mkdirSync('qa-backups', { recursive: true });
  const backupPath = `qa-backups/recover-from-books-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), questions: actions.map((a) => targetById.get(a.id)) }, null, 1));
  console.log('backup', backupPath, actions.length);

  let done = 0;
  for (const a of actions) {
    const d = targetById.get(a.id)!;
    const fresh = await prisma.question.findUnique({ where: { id: a.id }, select: { status: true, content: true, correctAnswer: true, explanation: true, options: true, reviewNotes: true, currentVersion: true } });
    if (!fresh || !['REPORTED', 'DRAFT'].includes(fresh.status) || fresh.content !== d.content || (fresh.correctAnswer ?? '') !== (d.correctAnswer ?? '') || (fresh.explanation ?? '') !== (d.explanation ?? '')) { console.log('skip (changed since the plan)', a.id); continue; }
    const notes = `[Source recovery ${TODAY}] ${a.note}\n\n${fresh.reviewNotes ?? ''}`.trim().slice(0, 6000);

    if (a.kind === 'ARCHIVE_SUPERSEDED') {
      await prisma.$transaction(async (tx) => {
        await tx.question.update({ where: { id: a.id }, data: { status: 'ARCHIVED', reviewNotes: notes } });
        await tx.auditLog.create({ data: { actorRole: 'SYSTEM', action: 'QUESTION_ARCHIVED_SUPERSEDED_BY_BOOK_COPY', entityType: 'Question', entityId: a.id, metadata: { sourceId: a.sourceId, score: a.score, backupPath } } });
      });
    } else {
      const options = a.gain.options ?? undefined;
      const afterOptions = options ?? optionsOf(d);
      const next = { type: a.gain.type ?? d.type, content: d.content, correctAnswer: a.gain.answer ?? d.correctAnswer, explanation: a.gain.explanation ?? d.explanation };
      const remaining = issuesOf(next, afterOptions);
      await prisma.$transaction(async (tx) => {
        await tx.questionVersion.create({ data: {
          questionId: a.id, version: fresh.currentVersion, content: d.content, options: (d.options ?? undefined) as never, correctAnswer: d.correctAnswer, explanation: d.explanation,
          type: d.type, difficulty: d.difficulty, topic: d.topic, subTopic: d.subTopic, tags: d.tags, changedBy: admin.id, changeReason: 'Recovered missing fields from the printed-book copy of the same question',
        } });
        await tx.question.update({ where: { id: a.id }, data: {
          ...(options ? { options } : {}),
          ...(a.gain.answer ? { correctAnswer: a.gain.answer } : {}),
          ...(a.gain.explanation ? { explanation: a.gain.explanation } : {}),
          ...(a.gain.type ? { type: a.gain.type as never } : {}),
          currentVersion: { increment: 1 },
          ...(d.status === 'REPORTED' && remaining.length === 0 ? { status: 'DRAFT' as const } : {}),
          reviewNotes: notes,
        } });
        await tx.auditLog.create({ data: { actorRole: 'SYSTEM', action: 'QUESTION_RECOVERED_FROM_BOOK_COPY', entityType: 'Question', entityId: a.id, metadata: { sourceId: a.sourceId, score: a.score, copied: Object.keys(a.gain), remaining: remaining.map((i) => i.code), backupPath } } });
      });
    }
    done++;
    if (done % 25 === 0) console.log('progress', done, '/', actions.length);
  }
  console.log('applied', done, 'of', actions.length);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });

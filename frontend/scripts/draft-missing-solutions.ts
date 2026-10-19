/**
 * Drafts missing answers and worked solutions for REPORTED and DRAFT questions that have no source copy,
 * under the rules in src/lib/solution-draft.ts (two independent models must agree on an objective answer;
 * a solution must reach an existing answer; everything else is labelled as one model's draft).
 *
 *   npx tsx scripts/draft-missing-solutions.ts --run [--limit=30] [--concurrency=3]
 *        asks the models and writes draft-solutions-results.json. Touches nothing in the database.
 *        Resumable: questions already in the results file are skipped.
 *   npx tsx scripts/draft-missing-solutions.ts --apply
 *        writes the accepted drafts from that file into the database (backup first, fill-only).
 *
 * Nothing is approved and nothing is overwritten. Drafted questions are tagged and carry a note.
 */
import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { analyzeQuestion } from '../src/lib/question-qa';
import { fetchFromLLM } from '../src/lib/llm';
import { composeDraft, notDraftableReason, parseSolverReply, solverPrompts, OBJECTIVE_TYPES, type Draft, type DraftQuestion } from '../src/lib/solution-draft';
import { parseQuestionOptions } from '../src/lib/arena-answer';

config({ path: '.env.local', quiet: true });

const RESULTS = 'draft-solutions-results.json';
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string, fallback: number) => Number(argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const TODAY = new Date().toISOString().slice(0, 10);
const RECENT_CUTOFF = new Date(Date.now() - 30 * 60 * 1000);
const SKIP_TYPES = new Set(['CASE_STUDY']); // case studies carry several sub-questions in one block; not safe to draft as one

// transient: the model could not be reached or gave nothing usable (a quota limit, say). Retried on the next run, up to 3 times.
type Result = { id: string; status: string; type: string; draft: Draft | null; skipped?: string; models?: { first?: string; second?: string }; transient?: boolean; attempts?: number };

async function solve(q: DraftQuestion, only: Array<'gemini' | 'groq' | 'openai'>, withSolution: boolean) {
  const { system, user } = solverPrompts(q, { withSolution });
  try {
    const raw = await fetchFromLLM(system, user, { json: false, only, maxTokens: withSolution ? 3000 : 1500, timeoutMs: 120_000 });
    return parseSolverReply(raw);
  } catch (error) {
    console.log('  solver error', only.join('/'), String(error).slice(0, 140));
    return null;
  }
}

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');

  if (flag('run')) {
    const done: Result[] = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : [];
    const seen = new Set(done.filter((r) => !(r.transient && (r.attempts ?? 1) < 3)).map((r) => r.id));
    const rows = await prisma.question.findMany({
      where: { status: { in: ['REPORTED', 'DRAFT'] }, createdAt: { lt: RECENT_CUTOFF } },
      select: { id: true, status: true, type: true, content: true, options: true, correctAnswer: true, explanation: true },
      orderBy: [{ status: 'desc' }, { createdAt: 'asc' }],
    });
    const candidates: Array<(typeof rows)[number]> = [];
    for (const q of rows) {
      if (seen.has(q.id) || SKIP_TYPES.has(q.type)) continue;
      // --objective: only objective questions that have no answer (the two-model agreement path).
      if (flag('objective') && !(OBJECTIVE_TYPES.has(q.type) && !(q.correctAnswer ?? '').trim())) continue;
      const options = parseQuestionOptions(q.options);
      const issues = analyzeQuestion({ content: q.content, options, correctAnswer: q.correctAnswer ?? '', explanation: q.explanation ?? '', type: q.type });
      const codes = issues.map((i) => i.code);
      if (!codes.includes('MISSING_ANSWER') && !codes.includes('MISSING_EXPLANATION')) continue;
      if (notDraftableReason(codes, q) !== null) continue;
      candidates.push(q);
    }
    const limit = value('limit', candidates.length);
    const batch = candidates.slice(0, limit);
    console.log(`candidates ${candidates.length}, this run ${batch.length}, already done ${done.length}`);

    const concurrency = value('concurrency', 3);
    let next = 0, finished = 0, consecutiveTransient = 0, stopped = false;
    const worker = async () => {
      while (next < batch.length && !stopped) {
        const q = batch[next++];
        const needsAnswer = OBJECTIVE_TYPES.has(q.type) && !(q.correctAnswer ?? '').trim();
        // When Gemini is out of quota, Groq can still write a solution that is checked against a stored answer, or a
        // single-model draft (which is labelled as such anyway). An answer that needs two independent models waits for Gemini.
        const first = (await solve(q, ['gemini'], true)) ?? (!needsAnswer ? await solve(q, ['groq'], true) : null);
        const second = needsAnswer && first ? (await solve(q, ['groq'], false)) ?? (await solve(q, ['openai'], false)) : null;
        const { draft, skipped } = composeDraft(q, first, second);
        const transient = !first;
        const previous = done.findIndex((r) => r.id === q.id);
        const attempts = previous >= 0 ? (done[previous].attempts ?? 1) + 1 : 1;
        if (previous >= 0) done.splice(previous, 1);
        done.push({ id: q.id, status: q.status, type: q.type, draft, skipped, models: { first: first?.finalAnswer, second: second?.finalAnswer }, ...(transient ? { transient: true, attempts } : {}) });
        // Several failures in a row means a quota or outage, not a hard question: stop and let a later run continue.
        consecutiveTransient = transient ? consecutiveTransient + 1 : 0;
        if (consecutiveTransient >= 8) { stopped = true; console.log('Stopping: 8 requests in a row got no usable reply (a quota limit or outage). Run the same command later to continue.'); }
        finished++;
        if (finished % 5 === 0 || finished === batch.length) { writeFileSync(RESULTS, JSON.stringify(done, null, 1)); console.log(`progress ${finished}/${batch.length}`); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    writeFileSync(RESULTS, JSON.stringify(done, null, 1));
    const accepted = done.filter((r) => r.draft);
    console.log(JSON.stringify({ total: done.length, accepted: accepted.length, verified: accepted.filter((r) => r.draft!.tier === 'VERIFIED').length, singleModel: accepted.filter((r) => r.draft!.tier === 'SINGLE_MODEL').length, answers: accepted.filter((r) => r.draft!.answer).length, explanations: accepted.filter((r) => r.draft!.explanation).length }, null, 1));
    const why = new Map<string, number>();
    for (const r of done) if (!r.draft) why.set(r.skipped ?? '?', (why.get(r.skipped ?? '?') ?? 0) + 1);
    console.log('not drafted:', [...why.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}x ${k}`).join(' | '));
    process.exit(0);
  }

  if (flag('apply')) {
    const results: Result[] = JSON.parse(readFileSync(RESULTS, 'utf8'));
    const accepted = results.filter((r) => r.draft);
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    if (!admin) throw new Error('No admin user to attribute version history to');
    const rows = await prisma.question.findMany({ where: { id: { in: accepted.map((r) => r.id) } }, select: { id: true, status: true, type: true, content: true, options: true, correctAnswer: true, explanation: true, tags: true, difficulty: true, topic: true, subTopic: true, currentVersion: true, reviewNotes: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    mkdirSync('qa-backups', { recursive: true });
    const backupPath = `qa-backups/draft-solutions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), questions: rows }, null, 1));
    console.log('backup', backupPath, rows.length);
    let done = 0;
    for (const r of accepted) {
      const q = byId.get(r.id);
      const d = r.draft!;
      // Fill-only: skip if it changed, was approved, or already has what the draft would add.
      if (!q || !['REPORTED', 'DRAFT'].includes(q.status)) continue;
      const wantAnswer = d.answer !== undefined && !(q.correctAnswer ?? '').trim();
      const wantExplanation = d.explanation !== undefined && (q.explanation ?? '').trim().length < 5;
      if (!wantAnswer && !wantExplanation) continue;
      const label = d.tier === 'VERIFIED' ? 'AI-Drafted: Verified by two models' : 'AI-Drafted: Single model, unchecked';
      const added = [wantAnswer && 'answer', wantExplanation && 'worked solution'].filter(Boolean).join(' and ');
      const note = `[AI draft ${TODAY}] ${added} drafted by a model, not taken from a printed source. ${d.notes.join('; ')}. ${d.tier === 'VERIFIED' ? '' : 'Not independently checked. '}Needs a reviewer before approval.`;
      const next = { type: q.type, content: q.content, correctAnswer: wantAnswer ? d.answer! : q.correctAnswer, explanation: wantExplanation ? d.explanation! : q.explanation };
      const remaining = analyzeQuestion({ content: q.content, options: parseQuestionOptions(q.options), correctAnswer: next.correctAnswer ?? '', explanation: next.explanation ?? '', type: q.type });
      await prisma.$transaction(async (tx) => {
        await tx.questionVersion.create({ data: { questionId: q.id, version: q.currentVersion, content: q.content, options: (q.options ?? undefined) as never, correctAnswer: q.correctAnswer, explanation: q.explanation, type: q.type, difficulty: q.difficulty, topic: q.topic, subTopic: q.subTopic, tags: q.tags, changedBy: admin.id, changeReason: 'AI-drafted missing answer/solution (not approved)' } });
        await tx.question.update({ where: { id: q.id }, data: {
          ...(wantAnswer ? { correctAnswer: d.answer } : {}),
          ...(wantExplanation ? { explanation: d.explanation } : {}),
          currentVersion: { increment: 1 },
          tags: [...new Set([...q.tags, label])],
          ...(q.status === 'REPORTED' && remaining.length === 0 ? { status: 'DRAFT' as const } : {}),
          reviewNotes: `${note}\n\n${q.reviewNotes ?? ''}`.trim().slice(0, 6000),
        } });
        await tx.auditLog.create({ data: { actorRole: 'SYSTEM', action: 'QUESTION_AI_DRAFTED', entityType: 'Question', entityId: q.id, metadata: { tier: d.tier, added, notes: d.notes, backupPath } } });
      });
      done++;
      if (done % 50 === 0) console.log('progress', done);
    }
    console.log('applied', done, 'of', accepted.length);
    process.exit(0);
  }

  console.log('Use --run (ask the models) or --apply (write accepted drafts).');
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });

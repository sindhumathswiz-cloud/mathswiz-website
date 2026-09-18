import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { fetchFromLLM } from '@/lib/llm';
import { provenanceApprovalError } from '@/lib/question-provenance';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * AI-assisted mathematical verification — the automated counterpart to the
 * one-time manual second review (13 Sep 2026). Deterministic QA
 * (question-qa.ts) already runs at every pipeline write and catches
 * structural/rendering problems; it cannot tell whether the math is actually
 * correct. This route closes that gap as a standing, reusable pipeline
 * stage: for each STRUCTURALLY_VALID DRAFT/REPORTED question in a book, an
 * LLM independently re-derives the answer from the question's own content
 * and either confirms it or flags it with evidence — the same decision
 * rubric used by hand in the manual review, now automated.
 *
 * Deliberately an admin-triggered batch endpoint, not a blind cron — every
 * other stage in this pipeline (render, extract, match-answer-keys,
 * match-detailed-solutions, the provider benchmarks) works this same way:
 * dry-run by default, explicit `apply`, bounded batch size. This keeps LLM
 * spend reviewable rather than an uncontrolled background cost. A true
 * unattended schedule (Vercel Cron hitting this route with apply:true) is a
 * natural follow-up once the batch form is proven out, not built here.
 *
 * Resumable/idempotent: once a question is tagged `AI-Verified: Confirmed` or
 * `AI-Verified: Flagged`, it's excluded from future batches — re-running this
 * route (e.g. after fixing an earlier flagged question by hand) only ever
 * processes NEW candidates, never re-spends on already-verified rows.
 *
 * Never invents missing premises: the prompt explicitly instructs the model
 * to return an `insufficient_information` issue rather than guess when the
 * question's own content doesn't give it enough to work with.
 *
 * Auto-approves on a "verified" verdict (status -> APPROVED, alongside
 * verificationStatus -> MATHEMATICALLY_VERIFIED): the user's explicit call,
 * given this only fires once a question ALREADY passed deterministic QA
 * (STRUCTURALLY_VALID) and this independent re-derivation both agree -- an
 * "issue" verdict never touches status, leaving it DRAFT/REPORTED with
 * NEEDS_REVIEW for the review queue exactly as before. Triggered
 * automatically right after a chapter (or whole-book) extraction finishes
 * (see extractChapter in ManifestEditorClient.tsx / extractBookQuestions in
 * BookCatalogClient.tsx) as well as by the manual "Auto-Populate"-style
 * button -- both paths share this one route, so the bar is identical either
 * way.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const SYSTEM_PROMPT = `You are an independent second reviewer verifying the mathematics of exam questions. You are strict, precise, and never invent missing information.

For the given question, independently re-derive the correct answer from the question's own content and options (if any). Then compare your derivation to the stored answer.

Rules:
- If your independent derivation matches the stored answer, and the explanation (if present) is a valid derivation, return a "verified" verdict.
- If the stored answer is wrong, the explanation contains a genuine mathematical error, or the question is internally inconsistent, return an "issue" verdict with a specific category and evidence (show your own derivation as evidence).
- If the question's content, options, or explanation are missing information you would need to verify it (a referenced diagram/figure not described in text, a missing premise, an incomplete statement), return an "issue" verdict with category "insufficient_information" -- do NOT guess or invent the missing premise.
- Respond with ONLY strict JSON, no markdown fences: {"verdict": "verified"} or {"verdict": "issue", "category": "...", "evidence": "..."}`;

interface Verdict {
  verdict: 'verified' | 'issue';
  category?: string;
  evidence?: string;
}

function parseVerdict(raw: string): Verdict | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && (parsed.verdict === 'verified' || parsed.verdict === 'issue')) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id }, select: { id: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const apply = body.apply === true;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));

  const candidates = await prisma.question.findMany({
    where: {
      bookId: id,
      status: { in: ['DRAFT', 'REPORTED'] },
      verificationStatus: 'STRUCTURALLY_VALID',
      NOT: { tags: { hasSome: ['AI-Verified: Confirmed', 'AI-Verified: Flagged'] } },
    },
    orderBy: [{ sourcePageStart: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    select: { id: true, content: true, options: true, correctAnswer: true, explanation: true, type: true, tags: true, reviewNotes: true, status: true, provenance: true, bookId: true, sourcePageStart: true, sourcePageEnd: true, printedNumber: true },
  });

  let verified = 0;
  let flagged = 0;
  let errored = 0;
  const details: Array<{ questionId: string; outcome: string; category?: string }> = [];

  for (const q of candidates) {
    const userPrompt = [
      `Question type: ${q.type}`,
      `Content: ${q.content}`,
      q.options ? `Options: ${JSON.stringify(q.options)}` : null,
      `Stored answer: ${q.correctAnswer ?? '(none)'}`,
      q.explanation ? `Stored explanation: ${q.explanation}` : 'Stored explanation: (none)',
    ].filter(Boolean).join('\n');

    let verdict: Verdict | null = null;
    let errorReason: string | null = null;
    try {
      const raw = await fetchFromLLM(SYSTEM_PROMPT, userPrompt, { json: true });
      verdict = parseVerdict(raw);
      if (!verdict) errorReason = `unparseable response: ${raw.slice(0, 300)}`;
    } catch (e) {
      verdict = null;
      errorReason = e instanceof Error ? e.message : String(e);
    }

    if (!verdict) {
      console.error(`[verify-mathematics] question ${q.id} errored: ${errorReason}`);
      errored++;
      details.push({ questionId: q.id, outcome: 'llm_error_will_retry' });
      continue; // left STRUCTURALLY_VALID, untagged -- picked up again next batch
    }

    if (verdict.verdict === 'verified') {
      verified++;
      // The Question Bank acceptance gate: mathematical verification alone
      // doesn't satisfy it -- a BOOK_SOURCED question also needs its source
      // page and printed number before it can reach APPROVED (see
      // lib/question-provenance.ts). Every candidate here already has a
      // bookId (query-scoped above), so the only way this fires is a
      // book-sourced question missing sourcePage/printedNumber -- verify the
      // math and record it, but leave status for a human to approve once
      // provenance is filled in, rather than silently skipping the check
      // because "it came from a book route."
      const provenanceReason = provenanceApprovalError(q);
      details.push({ questionId: q.id, outcome: apply ? (provenanceReason ? 'verified_pending_provenance' : 'verified') : 'would_verify' });
      if (apply) {
        const note = provenanceReason
          ? `[AI-Verified -- ${new Date().toISOString().slice(0, 10)}]\nIndependently re-derived by an automated verification pass and confirmed correct. NOT auto-approved: ${provenanceReason}`
          : `[AI-Verified -- ${new Date().toISOString().slice(0, 10)}]\nIndependently re-derived by an automated verification pass and confirmed correct. Auto-approved: passed deterministic QA and independent mathematical re-derivation.`;
        await prisma.question.update({
          where: { id: q.id },
          data: {
            ...(provenanceReason ? {} : { status: 'APPROVED' }),
            verificationStatus: 'MATHEMATICALLY_VERIFIED',
            tags: Array.from(new Set([...q.tags, 'AI-Verified: Confirmed'])),
            reviewNotes: q.reviewNotes ? `${q.reviewNotes}\n\n${note}` : note,
          },
        });
      }
    } else {
      flagged++;
      details.push({ questionId: q.id, outcome: apply ? 'flagged' : 'would_flag', category: verdict.category });
      if (apply) {
        const note = [
          `[AI-Verified -- ${new Date().toISOString().slice(0, 10)}]`,
          `Category: ${verdict.category || 'unspecified'}`,
          `Evidence: ${verdict.evidence || '(none provided)'}`,
          'Needs: teacher confirmation',
        ].join('\n');
        await prisma.question.update({
          where: { id: q.id },
          data: {
            verificationStatus: 'NEEDS_REVIEW',
            tags: Array.from(new Set([...q.tags, 'AI-Verified: Flagged'])),
            reviewNotes: q.reviewNotes ? `${q.reviewNotes}\n\n${note}` : note,
          },
        });
      }
    }
  }

  if (apply) {
    await recordAuditLog({
      actorId: auth.user.id,
      actorRole: 'ADMIN',
      action: 'BOOK_MATHEMATICS_VERIFIED',
      entityType: 'Book',
      entityId: id,
      metadata: { bookId: id, candidatesProcessed: candidates.length, verified, flagged, errored },
      ...requestAuditContext(request),
    });
  }

  return NextResponse.json({
    apply,
    limit,
    candidatesProcessed: candidates.length,
    verified,
    flagged,
    errored,
    details,
  });
}

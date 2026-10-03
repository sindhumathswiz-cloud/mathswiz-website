import prisma from './prisma';
import { provenanceApprovalError } from './question-provenance';
import { structuralApprovalError } from './question-qa';
import { evaluateFigureContext } from './question-figures';
import type { QuestionProvenance } from '@prisma/client';

/**
 * Roadmap Phase 3 — confidence-based review triage: composes the three
 * approval gates built for Issues 7-9 (provenance, structural QA, figure
 * retention/review) into one per-question risk signal, so the review queue
 * can surface the riskiest rows first with a concrete reason, instead of an
 * arbitrary order a reviewer has to open each row to understand.
 *
 * Also folds in the provider-agreement signal: when an admin has reconciled
 * a source page (POST .../ingestions/[runId]/reconcile, which compares the
 * stored Gemini and Mathpix readings and costs no extra OCR spend), a
 * question on that page whose formula the two providers disagree on is
 * blocked here until a human confirms it. Pages nobody has reconciled
 * contribute nothing -- absence of the check is not treated as agreement or
 * disagreement.
 *
 * Also deliberately does NOT persist a value into Question.extractionConfidence
 * -- doing that properly needs a batch reconciliation pass over every
 * question (the same shape as lib/exercise-reconciliation.ts), which is
 * its own follow-up. This computes risk live, batched across the whole
 * candidate pool in a couple of queries rather than one round-trip per
 * question, so it's cheap enough to run on every review-queue page load
 * without needing a persisted column yet.
 */

// A plain, explicit shape rather than combining the three gates' own
// parameter types via `extends` -- their individual interfaces were each
// written for their own single-question call site and don't agree bit-for-
// bit on optionality (e.g. content?: string vs content: string), even
// though every gate accepts the same actual data here.
export interface RiskAssessableQuestion {
  id: string;
  content: string;
  options?: string[];
  correctAnswer?: string | null;
  explanation?: string | null;
  type?: string;
  provenance: QuestionProvenance;
  bookId: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  printedNumber: string | null;
  confidence: number | null;
}

export interface QuestionRisk {
  score: number; // 0-100, higher = lower risk / closer to approvable
  blockers: string[]; // every gate's reason this can't approve right now, [] means clean
}

// Any blocker caps the score well under "safe to batch-approve" territory,
// and each additional blocker pushes it lower still -- ordering stays
// meaningful (2 blockers is riskier than 1) without needing every gate's
// severity to be independently calibrated against the others.
const BASE_BLOCKED_SCORE = 30;
const PER_EXTRA_BLOCKER_PENALTY = 10;

function scoreFor(confidence: number | null, blockers: string[]): number {
  if (blockers.length === 0) return confidence ?? 50;
  return Math.max(0, BASE_BLOCKED_SCORE - (blockers.length - 1) * PER_EXTRA_BLOCKER_PENALTY);
}

/**
 * Assesses many questions at once. Figure data (the only gate needing a
 * database round trip) is fetched in two queries total regardless of pool
 * size -- one for every candidate's own linked figures, one for every
 * unresolved figure across the candidates' books -- then joined in memory,
 * the same decision logic evaluateFigureContext already encodes for the
 * single-question approval gate.
 */
export async function assessQuestionsRisk(questions: RiskAssessableQuestion[]): Promise<Map<string, QuestionRisk>> {
  const ids = questions.map((q) => q.id);
  const bookIds = [...new Set(questions.map((q) => q.bookId).filter((b): b is string => b != null))];

  const pageBounds = questions.reduce<{ min: number; max: number } | null>((acc, q) => {
    if (q.sourcePageStart == null || q.sourcePageEnd == null) return acc;
    return acc ? { min: Math.min(acc.min, q.sourcePageStart), max: Math.max(acc.max, q.sourcePageEnd) } : { min: q.sourcePageStart, max: q.sourcePageEnd };
  }, null);

  const [linkedFigureRows, unresolvedFigureRows, heldReconciliationPages] = ids.length === 0 ? [[], [], []] : await Promise.all([
    prisma.pageFigure.findMany({
      where: { questionId: { in: ids } },
      select: { questionId: true, reviewedAt: true, matchedAutomatically: true },
    }),
    bookIds.length === 0 ? Promise.resolve([]) : prisma.pageFigure.findMany({
      where: { bookId: { in: bookIds }, questionId: null, reviewedAt: null },
      select: { bookId: true, pageNumber: true },
    }),
    bookIds.length === 0 || !pageBounds ? Promise.resolve([]) : prisma.documentPage.findMany({
      where: {
        document: { bookId: { in: bookIds } },
        pageNumber: { gte: pageBounds.min, lte: pageBounds.max },
        layoutData: { path: ['reconciliation', 'status'], equals: 'HAS_HOLDS' },
      },
      select: { pageNumber: true, layoutData: true, document: { select: { bookId: true } } },
    }),
  ]);

  // bookId -> pageNumber -> printed numbers the providers disagree on.
  const heldByBookPage = new Map<string, Map<number, string[]>>();
  for (const row of heldReconciliationPages) {
    const bookId = row.document.bookId;
    if (!bookId) continue;
    const layout = row.layoutData && typeof row.layoutData === 'object' && !Array.isArray(row.layoutData) ? row.layoutData as Record<string, unknown> : {};
    const record = layout.reconciliation && typeof layout.reconciliation === 'object' ? layout.reconciliation as Record<string, unknown> : {};
    const numbers = Array.isArray(record.heldPrintedNumbers) ? record.heldPrintedNumbers.map(String) : [];
    const pages = heldByBookPage.get(bookId) ?? new Map<number, string[]>();
    pages.set(row.pageNumber, numbers);
    heldByBookPage.set(bookId, pages);
  }

  const linkedByQuestion = new Map<string, Array<{ reviewedAt: Date | null; matchedAutomatically: boolean }>>();
  for (const row of linkedFigureRows) {
    if (!row.questionId) continue;
    const list = linkedByQuestion.get(row.questionId) ?? [];
    list.push({ reviewedAt: row.reviewedAt, matchedAutomatically: row.matchedAutomatically });
    linkedByQuestion.set(row.questionId, list);
  }
  const unresolvedByBook = new Map<string, number[]>();
  for (const row of unresolvedFigureRows) {
    const list = unresolvedByBook.get(row.bookId) ?? [];
    list.push(row.pageNumber);
    unresolvedByBook.set(row.bookId, list);
  }

  const result = new Map<string, QuestionRisk>();
  for (const question of questions) {
    const blockers: string[] = [];

    const provenanceReason = provenanceApprovalError(question);
    if (provenanceReason) blockers.push(provenanceReason);

    const structuralReason = structuralApprovalError({
      content: question.content,
      options: question.options,
      correctAnswer: question.correctAnswer ?? undefined,
      explanation: question.explanation ?? undefined,
      type: question.type,
    });
    if (structuralReason) blockers.push(structuralReason);

    if (question.bookId && question.sourcePageStart != null && question.sourcePageEnd != null) {
      const unresolvedOnPagePages = (unresolvedByBook.get(question.bookId) ?? [])
        .filter((page) => page >= question.sourcePageStart! && page <= question.sourcePageEnd!);
      const figureReason = evaluateFigureContext(question, {
        linkedFigures: linkedByQuestion.get(question.id) ?? [],
        unresolvedOnPagePages,
      });
      if (figureReason) blockers.push(figureReason);

      // A held page with no recorded printed numbers means the disputed
      // block could not be attributed to one question, so every question on
      // the page is held; otherwise only the question(s) that own it.
      const heldPages = heldByBookPage.get(question.bookId);
      const disputed = heldPages && [...heldPages.entries()].some(([page, numbers]) =>
        page >= question.sourcePageStart! && page <= question.sourcePageEnd! &&
        (numbers.length === 0 || (question.printedNumber != null && numbers.includes(question.printedNumber))));
      if (disputed) blockers.push('Two OCR providers read a formula in this question differently -- confirm it against the source page');
    }

    result.set(question.id, { score: scoreFor(question.confidence, blockers), blockers });
  }
  return result;
}

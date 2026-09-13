import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { findOrCreateBookChapter } from '../extract-questions/route';
import {
  parseSolutionBlocks,
  isLikelyDetailedSolutionsPage,
  solutionsSectionForPage,
  chapterForPage,
  loadConfirmedChapters,
  inAnyConfirmedChapter,
  contentAgreementScore,
} from '@/lib/book-manifest';
import { analyzeQuestion, worstSeverity } from '@/lib/question-qa';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * The prose counterpart to match-answer-keys: finds "Detailed Solutions" /
 * "Hints & Solutions" sections -- full worked-solution paragraphs printed by
 * number, pages away from the subjective/short/long-answer questions they
 * answer (Sindhu's books group these the same way MCQ answer keys are
 * grouped: exercise questions, then a solutions block for that exercise
 * later in the chapter, typically ~4-8 pages on but sometimes further) --
 * and backfills `explanation` onto the matching DRAFT Question rows by
 * printed number. Also opportunistically fixes `topic`/`bookChapterId` on a
 * matched question when it's missing, using its same-page match siblings as
 * evidence (see the topic-backfill section below).
 *
 * Same dependency as match-answer-keys: matching is by Question.printedNumber,
 * only populated on rows saved after that capture was added. Rows without it
 * need a forced re-extraction (POST .../extract-questions with force:true).
 *
 * Deliberately conservative, mirroring match-answer-keys:
 *  1. Only DRAFT rows, and only when the row doesn't already have a full
 *     solution -- eligible means explanation is empty OR the row is tagged
 *     "Questions without Solutions" (HINT or NONE, from extraction's
 *     explanationType classification). A row that already has a captured
 *     FULL explanation is never touched, matched or not.
 *  2. Any question type is eligible here (unlike match-answer-keys, which is
 *     MCQ-only) -- a prose solution doesn't need an option list to attach to.
 *  3. Same page-level coverage double-check as match-answer-keys
 *     (MIN_PAGE_COVERAGE): before trusting any match from a solutions page,
 *     enough of that page's printed numbers must correspond to SOME nearby
 *     DRAFT candidate, not just the one being matched.
 *  4. A solutions page must show an explicit heading ("Detailed Solutions",
 *     "Hints & Solutions", "Solutions to ...", etc.) near the top AND have
 *     at least MIN_BLOCKS real prose blocks (long enough to be genuine
 *     working, not just a stray mention of the word "solution") -- both
 *     required, so an ordinary question page (which also starts lines with
 *     "N. ...") is never mistaken for a solutions page.
 *
 * Topic/subtopic backfill: for the matched (single-eligible-candidate) rows
 * on ONE solutions page, if a clear majority of them already share the same
 * topic (>= TOPIC_MAJORITY_MIN_SHARE, from >= TOPIC_MAJORITY_MIN_COUNT
 * non-empty values), any matched row on that same page with an EMPTY topic
 * is snapped to that majority topic (and linked to/creates the matching
 * BookChapter). This doesn't invent a topic from nothing -- it only borrows
 * from sibling questions the page's own coverage check already vouched for,
 * which is exactly the kind of chapter-local context a solutions section
 * groups together.
 *
 * `apply` defaults to false (dry run). Pass { apply: true } to write.
 * printedNumber itself is left untouched here (see clear-printed-numbers).
 */

// The detailed-solutions page signal (SOLUTIONS_HEADING_RE, parseSolutionBlocks,
// isLikelyDetailedSolutionsPage) lives in lib/book-manifest.ts so the manifest
// detector and this route agree on what a solutions page looks like.

// Heuristic-fallback lookback -- comfortably covers the "4 to 8 pages apart"
// Sindhu described. A confirmed manifest replaces this with a direct
// section-range lookup.
const DETAILED_SOLUTION_LOOKBACK_PAGES = 40;

// Same double-check philosophy as match-answer-keys: MIN_PAGE_COVERAGE doc
// comment there explains the reasoning in full.
const MIN_PAGE_COVERAGE = 0.5;

// How confidently a page's matched rows must agree on a topic before an
// empty-topic sibling on the same page is snapped to it.
const TOPIC_MAJORITY_MIN_SHARE = 0.6;
const TOPIC_MAJORITY_MIN_COUNT = 2;

const MAX_DETAILS = 200;

const TAG_NO_SOLUTION = 'Questions without Solutions';
const TAG_HINT_AVAILABLE = 'Hint Available';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const apply = body.apply === true;

  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, sourceDocumentId: true },
  });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const pages = await prisma.documentPage.findMany({
    where: { documentId: run.sourceDocumentId, status: 'COMPLETED' },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, rawText: true },
  });

  // Prefer a confirmed chapter manifest (see match-answer-keys for the full
  // rationale): a solutions page inside a section's confirmed
  // solutionsStart..End range matches ONLY that section's questions.
  const confirmedChapters = await loadConfirmedChapters(id);

  let solutionsPagesFound = 0;
  let blocksFound = 0;
  let matched = 0;
  let updated = 0;
  let ambiguous = 0;
  let noCandidate = 0;
  let alreadyHasSolution = 0;
  let lowCoveragePagesSkipped = 0;
  let topicsBackfilled = 0;
  let manifestScopedPages = 0;
  let manifestSkippedPages = 0;
  let chapterBoundaryExcluded = 0;
  let contentAgreementResolved = 0;
  let contentAgreementFlagged = 0;
  const details: Array<{ page: number; printedNumber: string; questionId?: string; outcome: string }> = [];
  const chapterCache = new Map<string, string>();

  interface Candidate {
    id: string;
    content: string;
    type: string;
    options: unknown;
    correctAnswer: string | null;
    explanation: string | null;
    tags: string[];
    topic: string | null;
    reviewNotes: string | null;
    sourcePageStart: number | null;
  }
  interface BlockLookup {
    number: string;
    text: string;
    hasAnyCandidate: boolean;
    eligible: Candidate[];
  }

  for (const page of pages) {
    const rawText = page.rawText || '';
    const blocks = parseSolutionBlocks(rawText);
    if (!isLikelyDetailedSolutionsPage(rawText, blocks)) continue;
    solutionsPagesFound++;
    blocksFound += blocks.length;

    const manifestSection = solutionsSectionForPage(confirmedChapters, page.pageNumber);
    const insideConfirmedChapter = !manifestSection && chapterForPage(confirmedChapters, page.pageNumber);
    if (insideConfirmedChapter) {
      manifestSkippedPages++;
      if (details.length < MAX_DETAILS) {
        details.push({ page: page.pageNumber, printedNumber: '', outcome: 'not_in_confirmed_solutions_range' });
      }
      continue;
    }
    const sectionRange = manifestSection?.section.startPage != null && manifestSection.section.endPage != null
      ? { gte: manifestSection.section.startPage, lte: manifestSection.section.endPage }
      : null;
    if (sectionRange) manifestScopedPages++;

    const lookups: BlockLookup[] = [];
    for (const { number, text } of blocks) {
      const candidates = await prisma.question.findMany({
        where: {
          bookId: id,
          status: 'DRAFT',
          printedNumber: number,
          sourcePageStart: sectionRange ?? { gte: page.pageNumber - DETAILED_SOLUTION_LOOKBACK_PAGES, lt: page.pageNumber },
        },
        select: { id: true, content: true, type: true, options: true, correctAnswer: true, explanation: true, tags: true, topic: true, reviewNotes: true, sourcePageStart: true },
      });
      // Chapter-boundary scoping (heuristic fallback only -- see
      // match-answer-keys/route.ts for the full rationale, identical here).
      const boundaryFiltered = sectionRange
        ? candidates
        : candidates.filter((c) => {
          if (c.sourcePageStart == null) return true;
          const excluded = inAnyConfirmedChapter(confirmedChapters, c.sourcePageStart);
          if (excluded) chapterBoundaryExcluded++;
          return !excluded;
        });
      // Eligible = doesn't already have a real captured solution. A row with
      // a non-empty explanation that ISN'T tagged "Questions without
      // Solutions" already has a FULL solution (captured inline at
      // extraction time) and must never be overwritten by this pass.
      let eligible = boundaryFiltered.filter((c) => !c.explanation || c.tags.includes(TAG_NO_SOLUTION));
      // Content agreement: when printed-number proximity alone leaves more
      // than one eligible candidate, numeric overlap between the candidate's
      // own question content and this solution block's text can break the
      // tie -- a real worked solution to a question with numbers in its
      // statement should echo at least one of them. If exactly one candidate
      // shows agreement and the rest show none, resolve to it instead of
      // leaving the whole block ambiguous.
      if (eligible.length > 1) {
        const scored = eligible.map((c) => ({ c, agreement: contentAgreementScore(c.content, text, number) }));
        const withEvidence = scored.filter((s) => s.agreement.applicable && s.agreement.score > 0);
        if (withEvidence.length === 1) {
          eligible = [withEvidence[0].c];
          contentAgreementResolved++;
        }
      }
      lookups.push({ number, text, hasAnyCandidate: candidates.length > 0, eligible });
    }

    const withAnyCandidate = lookups.filter((l) => l.hasAnyCandidate).length;
    const coverage = blocks.length > 0 ? withAnyCandidate / blocks.length : 0;

    if (!sectionRange && coverage < MIN_PAGE_COVERAGE) {
      lowCoveragePagesSkipped++;
      if (details.length < MAX_DETAILS) {
        details.push({ page: page.pageNumber, printedNumber: '', outcome: `low_coverage_page_${withAnyCandidate}_of_${blocks.length}` });
      }
      continue;
    }

    // Matched rows on THIS page, collected so a majority topic among them
    // can backfill any of them missing a topic (see doc comment above).
    const pageMatches: Array<{ candidate: Candidate; number: string; text: string }> = [];

    // A SELECTED / HINTS section only carries solutions for some questions, so
    // a solution number with no extracted question is expected, not a gap.
    const partialCoverage = manifestSection != null
      && (manifestSection.section.solutionCoverage === 'SELECTED' || manifestSection.section.solutionCoverage === 'HINTS');
    const hintsOnly = manifestSection?.section.solutionCoverage === 'HINTS';

    for (const { number, text, eligible, hasAnyCandidate } of lookups) {
      if (eligible.length === 0) {
        // Distinguish "nothing with this number at all" from "found it, but
        // it already has a real solution" -- both are skips, but only the
        // first is a genuine gap.
        if (hasAnyCandidate) {
          alreadyHasSolution++;
          if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, outcome: 'already_has_solution' });
        } else {
          noCandidate++;
          if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, outcome: partialCoverage ? 'partial_coverage_expected' : 'no_candidate' });
        }
        continue;
      }
      if (eligible.length > 1) {
        ambiguous++;
        if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, outcome: `ambiguous_${eligible.length}_candidates` });
        continue;
      }

      matched++;
      const target = eligible[0];
      pageMatches.push({ candidate: target, number, text });
      if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, questionId: target.id, outcome: apply ? 'updated' : 'would_update' });
    }

    // Majority-topic backfill for this page's matched rows (dry-run counts
    // it too, so the preview reflects what apply:true would actually do).
    const topicCounts = new Map<string, number>();
    for (const { candidate } of pageMatches) {
      const t = (candidate.topic || '').trim();
      if (t) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
    }
    let majorityTopic: string | null = null;
    const totalWithTopic = Array.from(topicCounts.values()).reduce((a, b) => a + b, 0);
    for (const [topic, count] of topicCounts) {
      if (count >= TOPIC_MAJORITY_MIN_COUNT && count / totalWithTopic >= TOPIC_MAJORITY_MIN_SHARE) {
        majorityTopic = topic;
        break;
      }
    }

    for (const { candidate, number, text } of pageMatches) {
      const needsTopic = majorityTopic && !(candidate.topic || '').trim();
      if (needsTopic) topicsBackfilled++;

      if (!apply) continue;

      const kind = hintsOnly ? 'Hint' : 'Detailed solution';
      // Content agreement, re-checked at write time against this specific
      // candidate + block text (cheap; the ambiguous-resolution pass above
      // only needed it when there was more than one eligible candidate).
      const agreement = contentAgreementScore(candidate.content, text, number);
      const disagrees = agreement.applicable && agreement.score === 0;
      if (disagrees) contentAgreementFlagged++;
      const note = `${kind} backfilled from a solutions section (page ${page.pageNumber})${sectionRange ? ' within the confirmed chapter manifest range' : ' printed away from the question'} -- NOT independently verified yet; confirm before approving.`
        + (disagrees ? ' Content agreement: no shared numeric evidence found between the question and this solution block -- double-check.' : '');
      // A HINTS-coverage section carries hints, not full solutions -- keep the
      // "Hint Available" tag rather than clearing it.
      const nextTags = hintsOnly
        ? Array.from(new Set([...candidate.tags.filter((t) => t !== TAG_NO_SOLUTION), TAG_HINT_AVAILABLE]))
        : candidate.tags.filter((t) => t !== TAG_NO_SOLUTION && t !== TAG_HINT_AVAILABLE);
      const bookChapterId = needsTopic ? await findOrCreateBookChapter(id, majorityTopic as string, chapterCache) : undefined;

      // Re-run deterministic QA against the fields as they'll read AFTER this
      // write so verificationStatus never goes stale when this route
      // backfills an explanation -- same severity-to-status mapping
      // extract-questions/route.ts uses at creation (see match-answer-keys
      // for the identical pattern). A content-agreement disagreement forces
      // NEEDS_REVIEW regardless of the deterministic result, since it's
      // evidence this specific match may be wrong even if the text itself
      // renders fine.
      const qaIssues = analyzeQuestion({ content: candidate.content, options: candidate.options as string[] | undefined, correctAnswer: candidate.correctAnswer ?? undefined, explanation: text, type: candidate.type });
      const verificationStatus = disagrees || worstSeverity(qaIssues) === 'error' ? 'NEEDS_REVIEW' : 'STRUCTURALLY_VALID';

      await prisma.question.update({
        where: { id: candidate.id },
        data: {
          explanation: text,
          tags: nextTags,
          reviewNotes: candidate.reviewNotes ? `${candidate.reviewNotes}\n\n${note}` : note,
          verificationStatus,
          ...(needsTopic ? { topic: majorityTopic, bookChapterId } : {}),
        },
      });
      updated++;
    }
  }

  if (apply) {
    await recordAuditLog({
      actorId: auth.user.id,
      actorRole: 'ADMIN',
      action: 'BOOK_DETAILED_SOLUTIONS_MATCHED',
      entityType: 'BookIngestionRun',
      entityId: run.id,
      metadata: { bookId: id, solutionsPagesFound, blocksFound, matched, updated, ambiguous, noCandidate, alreadyHasSolution, lowCoveragePagesSkipped, topicsBackfilled, manifestScopedPages, manifestSkippedPages, chapterBoundaryExcluded, contentAgreementResolved, contentAgreementFlagged },
      ...requestAuditContext(request),
    });
  }

  return NextResponse.json({
    apply,
    manifestConfirmed: confirmedChapters.length > 0,
    manifestScopedPages,
    manifestSkippedPages,
    pagesScanned: pages.length,
    solutionsPagesFound,
    blocksFound,
    matched,
    updated,
    ambiguous,
    noCandidate,
    alreadyHasSolution,
    lowCoveragePagesSkipped,
    topicsBackfilled,
    chapterBoundaryExcluded,
    contentAgreementResolved,
    contentAgreementFlagged,
    detailsTruncated: details.length >= MAX_DETAILS,
    details,
  });
}

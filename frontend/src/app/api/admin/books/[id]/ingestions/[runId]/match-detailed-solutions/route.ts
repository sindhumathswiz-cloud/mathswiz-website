import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { findOrCreateBookChapter } from '../extract-questions/route';

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

// Requires the page's FIRST LINE to itself be a heading like "Solutions" or
// "Solutions of Selected Multiple Choice Questions" -- confirmed against
// real pages from Sindhu's book (e.g. pages 79, 107, 488, 499, 511, 526 of
// the Xam Idea run), which print the heading alone on its own line
// immediately before the first numbered solution. Anchoring to the START of
// the page (not just "appears somewhere near the top") is what keeps an
// ordinary question page -- which can easily contain the word "solution"
// inside a question stem a few lines down, e.g. "10. Show that the general
// solution of the differential equation..." -- from being mistaken for a
// solutions page.
const SOLUTIONS_HEADING_RE = /^(?:detailed\s+)?(?:solutions?|hints?)\b.{0,80}$/i;

// A solutions page needs at least this many numbered blocks, each averaging
// at least this many characters, to be trusted as real worked solutions
// rather than a false-positive heading match.
const MIN_BLOCKS = 2;
const MIN_AVG_BLOCK_CHARS = 40;

// Same lookback distance as match-answer-keys -- comfortably covers the
// "4 to 8 pages apart" Sindhu described, with headroom for a solutions
// section printed at the very end of a longer chapter.
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

interface SolutionBlock {
  number: string;
  text: string;
}

// A block boundary is a printed number immediately followed by "." or ")"
// then whitespace, where that number is preceded by the start of the page,
// a real line break, OR a closing "$" (end of the previous solution's
// LaTeX). That last case is the common one in practice: Mathpix frequently
// runs "...$2. We have,$..." together with NO newline between one compact
// solution's closing "$" and the next solution's leading number -- confirmed
// against real pages (79, 107, 488, 511) where a plain "preceded by \n"
// check misses most block boundaries entirely and silently merges several
// solutions into one. The lookbehind doesn't consume the "$", so it stays
// attached to the PREVIOUS block's text -- otherwise that block would lose
// its closing math delimiter and render broken.
function parseSolutionBlocks(rawText: string): SolutionBlock[] {
  const startRe = /(?<=^|\n|\$)[ \t]*(\d{1,3})[.)][ \t]+/g;
  const starts: Array<{ index: number; number: string; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(rawText))) {
    starts.push({ index: m.index, number: m[1], contentStart: m.index + m[0].length });
  }
  const blocks: SolutionBlock[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : rawText.length;
    const text = rawText.slice(starts[i].contentStart, end).trim();
    if (text) blocks.push({ number: starts[i].number, text });
  }
  return blocks;
}

function isLikelyDetailedSolutionsPage(rawText: string, blocks: SolutionBlock[]): boolean {
  if (blocks.length < MIN_BLOCKS) return false;
  const firstLine = rawText.trimStart().split('\n', 1)[0].trim();
  if (!SOLUTIONS_HEADING_RE.test(firstLine)) return false;
  const avgLen = blocks.reduce((sum, b) => sum + b.text.length, 0) / blocks.length;
  return avgLen >= MIN_AVG_BLOCK_CHARS;
}

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

  let solutionsPagesFound = 0;
  let blocksFound = 0;
  let matched = 0;
  let updated = 0;
  let ambiguous = 0;
  let noCandidate = 0;
  let alreadyHasSolution = 0;
  let lowCoveragePagesSkipped = 0;
  let topicsBackfilled = 0;
  const details: Array<{ page: number; printedNumber: string; questionId?: string; outcome: string }> = [];
  const chapterCache = new Map<string, string>();

  interface Candidate {
    id: string;
    explanation: string | null;
    tags: string[];
    topic: string | null;
    reviewNotes: string | null;
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

    const lookups: BlockLookup[] = [];
    for (const { number, text } of blocks) {
      const candidates = await prisma.question.findMany({
        where: {
          bookId: id,
          status: 'DRAFT',
          printedNumber: number,
          sourcePageStart: { gte: page.pageNumber - DETAILED_SOLUTION_LOOKBACK_PAGES, lt: page.pageNumber },
        },
        select: { id: true, explanation: true, tags: true, topic: true, reviewNotes: true },
      });
      // Eligible = doesn't already have a real captured solution. A row with
      // a non-empty explanation that ISN'T tagged "Questions without
      // Solutions" already has a FULL solution (captured inline at
      // extraction time) and must never be overwritten by this pass.
      const eligible = candidates.filter((c) => !c.explanation || c.tags.includes(TAG_NO_SOLUTION));
      lookups.push({ number, text, hasAnyCandidate: candidates.length > 0, eligible });
    }

    const withAnyCandidate = lookups.filter((l) => l.hasAnyCandidate).length;
    const coverage = blocks.length > 0 ? withAnyCandidate / blocks.length : 0;

    if (coverage < MIN_PAGE_COVERAGE) {
      lowCoveragePagesSkipped++;
      if (details.length < MAX_DETAILS) {
        details.push({ page: page.pageNumber, printedNumber: '', outcome: `low_coverage_page_${withAnyCandidate}_of_${blocks.length}` });
      }
      continue;
    }

    // Matched rows on THIS page, collected so a majority topic among them
    // can backfill any of them missing a topic (see doc comment above).
    const pageMatches: Array<{ candidate: Candidate; number: string; text: string }> = [];

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
          if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, outcome: 'no_candidate' });
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

    for (const { candidate, text } of pageMatches) {
      const needsTopic = majorityTopic && !(candidate.topic || '').trim();
      if (needsTopic) topicsBackfilled++;

      if (!apply) continue;

      const note = `Detailed solution backfilled from a solutions section (page ${page.pageNumber}) printed away from the question -- NOT independently verified yet; confirm before approving.`;
      const nextTags = candidate.tags.filter((t) => t !== TAG_NO_SOLUTION && t !== TAG_HINT_AVAILABLE);
      const bookChapterId = needsTopic ? await findOrCreateBookChapter(id, majorityTopic as string, chapterCache) : undefined;

      await prisma.question.update({
        where: { id: candidate.id },
        data: {
          explanation: text,
          tags: nextTags,
          reviewNotes: candidate.reviewNotes ? `${candidate.reviewNotes}\n\n${note}` : note,
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
      metadata: { bookId: id, solutionsPagesFound, blocksFound, matched, updated, ambiguous, noCandidate, alreadyHasSolution, lowCoveragePagesSkipped, topicsBackfilled },
      ...requestAuditContext(request),
    });
  }

  return NextResponse.json({
    apply,
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
    detailsTruncated: details.length >= MAX_DETAILS,
    details,
  });
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import {
  findAnswerKeyPairs,
  isLikelyAnswerKeyPage,
  answerKeySectionForPage,
  chapterForPage,
  loadConfirmedChapters,
} from '@/lib/book-manifest';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * Finds pages that are pure "answer key" listings (e.g. "1. (b) 2. (a) 3.
 * (c) ...") printed away from the questions they answer -- common in CBSE
 * practice books, where a whole exercise's key is printed together at the
 * end of the exercise or chapter -- and backfills `correctAnswer` onto the
 * matching DRAFT Question rows in this book by printed number.
 *
 * Root cause this addresses: extraction (extract-questions/route.ts)
 * only attaches an answer/explanation to a question when both are visible
 * in the SAME page's (or stitched fragment's) text. A key printed pages away
 * from its questions was never linked, which is a large share of why so
 * many DRAFT questions in this book have no captured answer at all.
 *
 * Dependency: matching is by Question.printedNumber, which is only
 * populated for rows saved AFTER the printedNumber capture was added to the
 * extraction prompt/normalizer (see structure-questions.ts /
 * extract-normalizer.ts). Rows extracted before that change have no
 * printedNumber and will not be matched here -- they need a forced
 * re-extraction pass (POST .../extract-questions with force:true) before
 * this can help them.
 *
 * Deliberately conservative in four ways:
 *  1. Only touches Question rows with status DRAFT (never overwrites
 *     already-approved or archived work) and only when correctAnswer is
 *     currently empty (never overwrites an existing answer, sourced or
 *     hand-verified).
 *  2. Only matches MCQ-shaped questions (options.length >= 2) -- a bare
 *     letter is only meaningful when there's an option list for it to
 *     select from.
 *  3. Only looks at most ANSWER_KEY_LOOKBACK_PAGES pages before the answer
 *     key page, and only when EXACTLY ONE DRAFT candidate with that printed
 *     number falls in that window -- a duplicate printed number within the
 *     lookback window (numbering restarts every exercise, so collisions are
 *     expected further back) is left unmatched rather than guessed.
 *  4. A double check beyond bare number-matching: before trusting ANY match
 *     from a given answer-key page, it requires that enough of that page's
 *     printed numbers actually correspond to a nearby DRAFT *MCQ-shaped*
 *     candidate (see MIN_PAGE_COVERAGE). A page's key numbering only lines
 *     up with our own extracted questions when it really is that exercise's
 *     key printed near those questions -- low coverage means either the
 *     wrong exercise/chapter or the questions it answers weren't extracted
 *     (or were extracted without a printedNumber), so isolated single-number
 *     "coincidences" on that page are not trustworthy and the whole page is
 *     skipped rather than matching them individually. (Sindhu's real answer
 *     keys are bare "N.(letter)" pairs with no inline hint/solution text to
 *     cross-check against, so this coverage check -- not per-item text
 *     matching -- is what "double check rather than only relying on the
 *     question numbers" means here.)
 *
 *     Coverage deliberately counts ONLY MCQ-shaped candidates (a real option
 *     list), not "any candidate with this printed number" -- found the hard
 *     way on a real run: small printed numbers (1-10, 1-20) are ubiquitous
 *     because every exercise in a chapter restarts its own numbering, so a
 *     book of any size will have SOME subjective/long-answer DRAFT question
 *     sharing almost any small number within a 40-page lookback window,
 *     completely unrelated to the answer-key page being evaluated. Counting
 *     those non-MCQ hits toward coverage let a wrong chapter's answer-key
 *     page (e.g. one belonging to a chapter that hasn't been extracted yet,
 *     so it has no real candidates of its own) pass the coverage bar purely
 *     on unrelated subjective-question coincidences, while the REAL answer
 *     key for those MCQs -- printed nearer, but itself under the coverage
 *     bar for unrelated reasons -- got skipped and never got a chance to
 *     claim them first. Requiring MCQ-shaped evidence specifically ties the
 *     coverage check to the only kind of question this route can ever
 *     actually write an answer onto.
 *
 * `apply` defaults to false (dry run): the response reports what WOULD be
 * matched/updated without writing anything, so the match quality can be
 * reviewed before committing. Pass { apply: true } to actually write.
 *
 * NOTE on printedNumber: it is deliberately NOT cleared by this route. A
 * sibling pass (match-detailed-solutions) also needs printedNumber to link a
 * subjective/long-answer question to its full solution printed elsewhere in
 * the chapter, and there's no reliable way for either pass to know it's the
 * LAST number-based matching pass that will run against a given book. Once
 * every such pass has been run, call POST .../clear-printed-numbers once to
 * discard it -- see that route's doc comment.
 */

// The answer-key page signal (ANSWER_PAIR_RE, findAnswerKeyPairs,
// isLikelyAnswerKeyPage) lives in lib/book-manifest.ts so the manifest
// detector and this route agree on what an answer-key page looks like.

// How far back (in printed pages) to look for a DRAFT question with a
// matching printed number. Covers "key printed at the end of the exercise"
// and "key printed at the end of the chapter" without reaching so far back
// that a number collision from an unrelated earlier exercise gets matched.
// Only used for the heuristic fallback; a confirmed manifest replaces this
// with a direct section-range lookup.
const ANSWER_KEY_LOOKBACK_PAGES = 40;

// The "double check" for a whole answer-key page: at least this fraction of
// the page's printed numbers must have SOME DRAFT MCQ candidate in the
// lookback window (matched or ambiguous -- ambiguous still proves the
// number range is the right one, just not which specific row) before any
// individual match from that page is trusted. Below this, a lone matching
// number is more likely a coincidence (e.g. a different exercise's key that
// happens to share a low number like "1" or "2") than a real link.
const MIN_PAGE_COVERAGE = 0.5;

// Cap on how many per-match details are echoed back in the response, so a
// large book doesn't blow up the JSON payload -- the summary counts are
// always complete regardless.
const MAX_DETAILS = 200;

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

  // Prefer a confirmed chapter manifest: an answer-key page inside a section's
  // confirmed answerKeyStart..End range matches ONLY that section's questions
  // (by printedNumber), a direct range lookup instead of the 40-page lookback
  // + coverage heuristic. Falls back to the heuristic for any page not covered
  // by a confirmed chapter.
  const confirmedChapters = await loadConfirmedChapters(id);

  let answerKeyPagesFound = 0;
  let pairsFound = 0;
  let matched = 0;
  let updated = 0;
  let ambiguous = 0;
  let noCandidate = 0;
  let lowCoveragePagesSkipped = 0;
  let manifestScopedPages = 0;
  let manifestSkippedPages = 0;
  const details: Array<{ page: number; printedNumber: string; letter: string; questionId?: string; outcome: string }> = [];

  interface CandidateLookup {
    number: string;
    letter: string;
    hasAnyCandidate: boolean;
    mcqCandidates: Array<{ id: string; options: unknown; sourcePageStart: number | null; reviewNotes: string | null }>;
  }

  for (const page of pages) {
    const rawText = page.rawText || '';
    const pairs = findAnswerKeyPairs(rawText);
    if (!isLikelyAnswerKeyPage(rawText, pairs)) continue;
    answerKeyPagesFound++;
    pairsFound += pairs.length;

    // Manifest path: this answer-key page sits inside a confirmed section's
    // answer-key range → scope candidates to that section's question pages and
    // skip the coverage heuristic (the range is human-confirmed).
    const manifestSection = answerKeySectionForPage(confirmedChapters, page.pageNumber);
    // Manifest present but this key page isn't in any confirmed answer-key
    // range, though it IS inside a confirmed chapter → the admin didn't expect
    // a key here; don't guess with the old lookback.
    const insideConfirmedChapter = !manifestSection && chapterForPage(confirmedChapters, page.pageNumber);
    if (insideConfirmedChapter) {
      manifestSkippedPages++;
      if (details.length < MAX_DETAILS) {
        details.push({ page: page.pageNumber, printedNumber: '', letter: '', outcome: 'not_in_confirmed_answer_key_range' });
      }
      continue;
    }

    const sectionRange = manifestSection?.section.startPage != null && manifestSection.section.endPage != null
      ? { gte: manifestSection.section.startPage, lte: manifestSection.section.endPage }
      : null;
    if (sectionRange) manifestScopedPages++;

    // First pass: look up candidates for every pair on this page WITHOUT
    // writing or counting anything yet, so coverage can be judged before any
    // individual match on this page is trusted (see MIN_PAGE_COVERAGE doc
    // comment above).
    const lookups: CandidateLookup[] = [];
    for (const { number, letter } of pairs) {
      const candidates = await prisma.question.findMany({
        where: {
          bookId: id,
          status: 'DRAFT',
          printedNumber: number,
          OR: [{ correctAnswer: null }, { correctAnswer: '' }],
          sourcePageStart: sectionRange ?? { gte: page.pageNumber - ANSWER_KEY_LOOKBACK_PAGES, lt: page.pageNumber },
        },
        select: { id: true, options: true, sourcePageStart: true, reviewNotes: true },
      });
      // Only an MCQ-shaped question (a real option list for the letter to
      // select from) is eligible to actually receive the answer letter --
      // but ANY candidate (MCQ-shaped or not) still counts as evidence this
      // page's numbering lines up with our extracted questions, for the
      // coverage check below.
      const mcqCandidates = candidates.filter((c) => Array.isArray(c.options) && c.options.length >= 2);
      // Coverage evidence requires an MCQ-shaped candidate specifically --
      // see the coverage doc comment above for why a bare "some candidate
      // exists with this number" is not trustworthy evidence on its own.
      lookups.push({ number, letter, hasAnyCandidate: mcqCandidates.length > 0, mcqCandidates });
    }

    const withAnyCandidate = lookups.filter((l) => l.hasAnyCandidate).length;
    const coverage = pairs.length > 0 ? withAnyCandidate / pairs.length : 0;

    // The coverage double-check is a heuristic-fallback safeguard. A confirmed
    // manifest section already vouches for the number range, so skip it there.
    if (!sectionRange && coverage < MIN_PAGE_COVERAGE) {
      // Not enough of this page's numbers correspond to anything nearby --
      // treat the whole page as unreliable rather than cherry-picking the
      // one or two numbers that happened to line up.
      lowCoveragePagesSkipped++;
      if (details.length < MAX_DETAILS) {
        details.push({ page: page.pageNumber, printedNumber: '', letter: '', outcome: `low_coverage_page_${withAnyCandidate}_of_${pairs.length}` });
      }
      continue;
    }

    for (const { number, letter, mcqCandidates } of lookups) {
      if (mcqCandidates.length === 0) {
        noCandidate++;
        if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, letter, outcome: 'no_candidate' });
        continue;
      }
      if (mcqCandidates.length > 1) {
        ambiguous++;
        if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, letter, outcome: `ambiguous_${mcqCandidates.length}_candidates` });
        continue;
      }

      matched++;
      const target = mcqCandidates[0];
      if (details.length < MAX_DETAILS) details.push({ page: page.pageNumber, printedNumber: number, letter, questionId: target.id, outcome: apply ? 'updated' : 'would_update' });

      if (apply) {
        const note = `Answer "${letter}" backfilled from an answer-key page (page ${page.pageNumber})${sectionRange ? ' within the confirmed chapter manifest range' : ' printed away from the question'} -- NOT independently verified yet; confirm before approving.`;
        await prisma.question.update({
          where: { id: target.id },
          data: {
            correctAnswer: letter,
            reviewNotes: target.reviewNotes ? `${target.reviewNotes}\n\n${note}` : note,
          },
        });
        updated++;
      }
    }
  }

  if (apply) {
    await recordAuditLog({
      actorId: auth.user.id,
      actorRole: 'ADMIN',
      action: 'BOOK_ANSWER_KEYS_MATCHED',
      entityType: 'BookIngestionRun',
      entityId: run.id,
      metadata: { bookId: id, answerKeyPagesFound, pairsFound, matched, updated, ambiguous, noCandidate, lowCoveragePagesSkipped, manifestScopedPages, manifestSkippedPages },
      ...requestAuditContext(request),
    });
  }

  return NextResponse.json({
    apply,
    manifestConfirmed: confirmedChapters.length > 0,
    pagesScanned: pages.length,
    answerKeyPagesFound,
    pairsFound,
    matched,
    updated,
    ambiguous,
    noCandidate,
    lowCoveragePagesSkipped,
    manifestScopedPages,
    manifestSkippedPages,
    detailsTruncated: details.length >= MAX_DETAILS,
    details,
  });
}

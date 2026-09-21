import prisma from './prisma';

/**
 * The figure half of the approval bar, alongside provenance
 * (lib/question-provenance.ts) and structural QA (lib/question-qa.ts): a
 * question whose printed text depends on a diagram/figure/graph must have
 * that asset actually retained and looked at by a human before it reaches
 * APPROVED -- an auto-matched-but-never-reviewed image, or a missing one, is
 * exactly the silent failure this gate exists to catch.
 *
 * Every figure Mathpix detects on a page is captured as its own PageFigure
 * row regardless of whether extraction could place it (see
 * capturePageFigures in extract-questions/route.ts), and the vertical-
 * position auto-match (figure-question-match.ts) can place one on the wrong
 * question on a dense multi-question page. reviewedAt is only ever stamped
 * by a human via the figures review route (figures/[figureId]/route.ts),
 * never by the pipeline itself -- so it's the one reliable signal that a
 * figure assignment was actually looked at, not just guessed.
 */

// Trigger words a question's own text uses when it depends on a visual the
// reader needs to see -- distinct from question-qa.ts's MISSING_DATA check,
// which is about whether a matrix/array is typed out as inline LaTeX, not
// about whether an image asset exists.
const FIGURE_REFERENCE_PATTERN = /given matrix|following matrix|the matrix\b|following system|figure|diagram|graph shown|shown (above|below)|as shown/i;

export function contentReferencesFigure(text: string | null | undefined): boolean {
  return FIGURE_REFERENCE_PATTERN.test(text || '');
}

export interface FigureApprovableQuestion {
  id: string;
  bookId: string | null;
  content: string;
  explanation?: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
}

/**
 * Returns a reason the question cannot be approved yet, or null if it may
 * be. Only meaningful for a question with a real book + page range —
 * MANUALLY_AUTHORED / page-less questions have no PageFigure rows to check
 * against and always pass.
 */
export async function figureApprovalError(question: FigureApprovableQuestion): Promise<string | null> {
  if (!question.bookId || question.sourcePageStart == null || question.sourcePageEnd == null) return null;

  const [linkedFigures, unresolvedOnPage] = await Promise.all([
    prisma.pageFigure.findMany({
      where: { questionId: question.id },
      select: { id: true, reviewedAt: true, matchedAutomatically: true },
    }),
    // A figure on this question's own source page(s) that's neither matched
    // to any question nor confirmed irrelevant by a human -- it might
    // actually belong to THIS question and hasn't been triaged yet, so
    // approving anything off this page is premature either way.
    prisma.pageFigure.findMany({
      where: {
        bookId: question.bookId,
        pageNumber: { gte: question.sourcePageStart, lte: question.sourcePageEnd },
        questionId: null,
        reviewedAt: null,
      },
      select: { id: true, pageNumber: true },
    }),
  ]);

  const requiresFigure = linkedFigures.length > 0 || contentReferencesFigure(question.content) || contentReferencesFigure(question.explanation);

  if (requiresFigure && linkedFigures.length === 0) {
    return 'Question text references a figure/diagram but has no retained figure asset linked -- attach one via the figure review screen before approving.';
  }

  const unreviewed = linkedFigures.filter((f) => f.reviewedAt == null);
  if (requiresFigure && unreviewed.length > 0) {
    const autoOnly = unreviewed.every((f) => f.matchedAutomatically);
    return `Question has ${unreviewed.length} linked figure(s) that ${autoOnly ? 'were only auto-matched by position and have' : 'have'} not completed visual review -- confirm them via the figure review screen before approving.`;
  }

  if (unresolvedOnPage.length > 0) {
    const pages = [...new Set(unresolvedOnPage.map((f) => f.pageNumber))].sort((a, b) => a - b);
    return `Page ${pages.join(', ')} has ${unresolvedOnPage.length} unmatched figure(s) not yet reviewed -- resolve them (assign or dismiss) before approving questions sourced from ${pages.length > 1 ? 'these pages' : 'this page'}.`;
  }

  return null;
}

import type { CanonicalQuestion } from './extract-normalizer';

/**
 * Detects a book page whose raw OCR/native text is a CASE_STUDY passage that
 * is still incomplete on this page — either because the page is purely the
 * intro/stem (its sub-questions are printed on the next page), or because
 * the structuring LLM had nothing to segment yet and echoed the bare passage
 * back as a single "question" with no explanation and no visible sub-parts.
 *
 * Root cause this addresses: extraction runs one rendered page at a time
 * (see extract-questions/route.ts), but a case study's passage and its (i)-(v)
 * sub-questions are frequently printed across a page boundary in the source
 * book. Left alone, that produces two broken Question rows — a passage-only
 * orphan with no explanation, and a sub-questions-only row missing its own
 * context — instead of the one combined question the book actually contains.
 * The caller (extract-questions/route.ts) uses this to decide whether to
 * hold this page's text and stitch it onto the next page before structuring,
 * rather than saving a broken fragment.
 */

const CASE_STUDY_INTRO_RE = /\bcase\s*study\b|\bread\s+the\s+following\b|\bbased\s+on\s+the\s+(?:above|following)\b/i;

// Sub-part markers a genuine multi-part case study exposes once its questions
// are present: "(i)", "(ii)", "(iv)", or lettered sub-options "(a)"-"(d)".
const HAS_SUBPART_MARKERS_RE = /\([ivx]{1,4}\)|\([a-d]\)/i;

export function isLikelyCaseStudyFragment(rawText: string, questions: CanonicalQuestion[]): boolean {
  if (!rawText || !CASE_STUDY_INTRO_RE.test(rawText)) return false;

  // Structuring found nothing usable at all on a page that reads like a case
  // study intro — almost certainly just the passage, with its questions on
  // the next page.
  if (questions.length === 0) return true;

  // Structuring emitted exactly one "question" with no worked solution and no
  // sub-part markers — the LLM had nothing to segment yet and echoed the
  // passage back verbatim rather than a real question.
  if (questions.length === 1) {
    const q = questions[0];
    return !q.explanation.trim() && !HAS_SUBPART_MARKERS_RE.test(q.questionContent);
  }

  return false;
}

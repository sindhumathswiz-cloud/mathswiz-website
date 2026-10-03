import { assembleOcrPage, type OcrBlock, type PageAssemblyResult, type ReconciliationDecision } from './book-semantic-assembler';
import { compareBlockToCandidates, comparisonTokens, MIN_COMPARABLE_TOKENS } from './formula-reconciliation';

/**
 * Two-provider agreement for one rendered page: Mathpix supplies the
 * line-level structure and formula text, Gemini's structured transcription
 * of the same page is the independent second reading. Every formula-bearing
 * Mathpix block is scored against Gemini's text; blocks the two providers
 * do not agree on are handed to the semantic assembler as
 * HOLD_FOR_RECONCILIATION so the questions they belong to are held for a
 * human instead of being trusted.
 *
 * No provider is called here. Both readings must already exist as completed
 * PageExtractionBenchmark rows (each created by an explicit admin action),
 * so reconciling never adds OCR spend.
 */

type MathpixLine = {
  type?: string;
  text?: string;
  included?: boolean;
  cnt?: Array<[number, number]>;
};

export type GeminiPage = {
  questions?: Array<{
    contentMmd?: string;
    options?: Array<{ contentMmd?: string }>;
    answerMmd?: string | null;
    solutionMmd?: string | null;
  }>;
};

const MATH_MARKUP = /\\\(|\\\[|\$|\\[a-zA-Z]+|[\^_]\{?/;

const BLOCK_TYPE_MAP: Record<string, string> = {
  math: 'equation',
  title: 'title',
  page_info: 'header',
  diagram: 'image',
  chart: 'image',
};

export function mathpixLinesToBlocks(rawOutput: unknown): OcrBlock[] {
  const lines = (rawOutput as { line_data?: unknown } | null)?.line_data;
  if (!Array.isArray(lines)) return [];
  return (lines as MathpixLine[])
    .filter((line) => line.included !== false)
    .map((line) => {
      const xs = (line.cnt ?? []).map((point) => point[0]);
      const ys = (line.cnt ?? []).map((point) => point[1]);
      return {
        type: BLOCK_TYPE_MAP[line.type ?? ''] ?? 'text',
        content: line.text ?? '',
        ...(xs.length ? { top_left_x: Math.min(...xs), bottom_right_x: Math.max(...xs), top_left_y: Math.min(...ys), bottom_right_y: Math.max(...ys) } : {}),
      };
    });
}

export function geminiCandidateLines(structured: GeminiPage | null | undefined): string[] {
  const lines: string[] = [];
  for (const question of structured?.questions ?? []) {
    const parts = [question.contentMmd, ...(question.options ?? []).map((option) => option.contentMmd), question.answerMmd, question.solutionMmd];
    for (const part of parts) {
      for (const line of String(part ?? '').split(/\n+/)) if (line.trim()) lines.push(line.trim());
    }
  }
  // Mathpix often reads several adjacent lines (e.g. all four options) as one
  // block, while Gemini lists them separately -- offer joined runs of up to
  // four consecutive lines as additional candidates.
  const joined: string[] = [];
  for (let size = 2; size <= 4; size += 1) {
    for (let start = 0; start + size <= lines.length; start += 1) joined.push(lines.slice(start, start + size).join(' '));
  }
  return [...lines, ...joined];
}

// Option labels and question numbers are layout, not content: Gemini returns them as separate fields.
function stripLayoutLabels(text: string): string {
  return text.replace(/(^|\s)\(?[a-dA-D]\)\s*/g, ' ').replace(/^\s*\d+[.)]\s+/, '');
}

function isFormulaBearing(block: OcrBlock): boolean {
  if (['header', 'footer', 'title', 'image'].includes(block.type)) return false;
  return block.type === 'equation' || MATH_MARKUP.test(block.content ?? '');
}

export type BlockReconciliation = ReconciliationDecision & {
  critical: boolean;
  preview: string;
  blockOnlyTokens: string[];
  candidateOnlyTokens: string[];
};

export type PageReconciliation = {
  status: 'CLEAN' | 'HAS_HOLDS' | 'INSUFFICIENT_EVIDENCE';
  comparedBlocks: number;
  agreementBlocks: number;
  heldBlocks: number;
  meanSimilarity: number | null;
  blocks: BlockReconciliation[];
  /** Printed numbers of assembled questions held because of a disputed formula. */
  heldPrintedNumbers: string[];
  assembly: PageAssemblyResult;
};

export function reconcilePage(input: {
  pageNumber: number;
  bookName: string;
  mathpixOutput: unknown;
  geminiStructured: GeminiPage | null | undefined;
}): PageReconciliation {
  return reconcileBlocks({
    pageNumber: input.pageNumber,
    bookName: input.bookName,
    blocks: mathpixLinesToBlocks(input.mathpixOutput),
    candidates: geminiCandidateLines(input.geminiStructured),
  });
}

/** Provider-agnostic core: one reading's blocks scored against the other reading's candidate lines. */
export function reconcileBlocks(input: {
  pageNumber: number;
  bookName: string;
  blocks: OcrBlock[];
  candidates: string[];
}): PageReconciliation {
  const { blocks, candidates } = input;

  const compared: BlockReconciliation[] = [];
  if (candidates.length > 0) {
    blocks.forEach((block, blockIndex) => {
      if (!isFormulaBearing(block)) return;
      if (comparisonTokens(block.content).length < MIN_COMPARABLE_TOKENS) return;
      const result = compareBlockToCandidates(stripLayoutLabels(block.content), candidates);
      compared.push({
        pageNumber: input.pageNumber,
        blockIndex,
        reviewStatus: result.reviewStatus,
        similarity: result.similarity,
        critical: result.criticalDisagreement,
        preview: block.content.slice(0, 160),
        blockOnlyTokens: result.blockOnlyTokens,
        candidateOnlyTokens: result.candidateOnlyTokens,
      });
    });
  }

  const assembly = assembleOcrPage({
    pageNumber: input.pageNumber,
    bookName: input.bookName,
    blocks,
    reconciliation: compared,
  });
  const heldPrintedNumbers = assembly.questions
    .filter((question) => question.holdReasons.some((reason) => reason.startsWith('FORMULA_PROVIDER_DISAGREEMENT')))
    .map((question) => question.sourceQuestionNumber);
  const heldBlocks = compared.filter((item) => item.reviewStatus === 'HOLD_FOR_RECONCILIATION').length;

  return {
    status: candidates.length === 0 ? 'INSUFFICIENT_EVIDENCE' : heldBlocks > 0 ? 'HAS_HOLDS' : 'CLEAN',
    comparedBlocks: compared.length,
    agreementBlocks: compared.length - heldBlocks,
    heldBlocks,
    meanSimilarity: compared.length ? Number((compared.reduce((sum, item) => sum + item.similarity, 0) / compared.length).toFixed(4)) : null,
    blocks: compared,
    heldPrintedNumbers,
    assembly,
  };
}

/**
 * Identity of a page's disputes: the same set of disputed blocks gives the
 * same fingerprint, so a human review of them survives re-running the check
 * but not a change in what the providers actually disagree on.
 */
export function disputeFingerprint(result: PageReconciliation): string {
  const text = result.blocks
    .filter((item) => item.reviewStatus === 'HOLD_FOR_RECONCILIATION')
    .map((item) => item.preview)
    .sort()
    .join('');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `${result.heldBlocks}:${hash.toString(36)}`;
}

export type ReconciliationPairing = { mathpixOrigin: 'BENCHMARK' | 'EXTRACTION' };

/** The slice of a PageReconciliation worth keeping on DocumentPage.layoutData. */
export function reconciliationRecord(result: PageReconciliation, pairing?: ReconciliationPairing) {
  return {
    version: 1,
    fingerprint: disputeFingerprint(result),
    pairing: pairing ? { primary: 'MATHPIX_OCR', primaryOrigin: pairing.mathpixOrigin, secondary: 'GEMINI_VISION' } : null,
    computedAt: new Date().toISOString(),
    providers: ['GEMINI_VISION', 'MATHPIX_OCR'],
    status: result.status,
    comparedBlocks: result.comparedBlocks,
    agreementBlocks: result.agreementBlocks,
    heldBlocks: result.heldBlocks,
    meanSimilarity: result.meanSimilarity,
    heldPrintedNumbers: result.heldPrintedNumbers,
    heldBlockDetails: result.blocks
      .filter((item) => item.reviewStatus === 'HOLD_FOR_RECONCILIATION')
      .slice(0, 50)
      .map(({ blockIndex, similarity, critical, preview, blockOnlyTokens, candidateOnlyTokens }) => ({ blockIndex, similarity, critical, preview, blockOnlyTokens, candidateOnlyTokens })),
    draftSummary: {
      questions: result.assembly.questions.length,
      held: result.assembly.questions.filter((question) => question.reviewStatus === 'HOLD').length,
      ready: result.assembly.questions.filter((question) => question.reviewStatus === 'READY_FOR_SEMANTIC_REVIEW').length,
    },
  };
}

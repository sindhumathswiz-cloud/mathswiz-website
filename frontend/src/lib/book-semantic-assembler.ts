export type OcrBlock = {
  type: string;
  content: string;
  top_left_x?: number;
  top_left_y?: number;
  bottom_right_x?: number;
  bottom_right_y?: number;
};

export type ReconciliationDecision = {
  pageNumber: number;
  blockIndex: number;
  reviewStatus: 'AGREEMENT_PASS' | 'HOLD_FOR_RECONCILIATION';
  similarity: number;
};

export type AssembledQuestionDraft = {
  sourceId: string;
  sourceQuestionNumber: string;
  sourcePage: number;
  sourceBlockIndices: number[];
  bookName: string;
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SUBJECTIVE';
  tags: string[];
  reviewStatus: 'READY_FOR_SEMANTIC_REVIEW' | 'HOLD';
  holdReasons: string[];
};

export type PageAssemblyResult = {
  questions: AssembledQuestionDraft[];
  orphanBlocks: Array<{ blockIndex: number; content: string; reason: string }>;
};

const QUESTION_START = /^(?:\*{0,2})?(?:example\s+|q(?:uestion)?\.?\s*)?(\d+)(?:\*{0,2})?\s*[.)]?(?:\s+|$)/i;
const EXPLICIT_QUESTION_START = /^(?:\*{0,2})?(?:example\s+|q(?:uestion)?\.?\s*)\d+(?:\*{0,2})?/i;
const OPTION_START = /^\s*\(?([a-dA-D])\)\s*/;
const SOLUTION_START = /^\s*(?:\*{0,2})?(?:sol(?:ution)?\.?|detailed solution)(?:\*{0,2})?\s*/i;
const ANSWER_START = /^\s*(?:\*{0,2})?(?:ans(?:wer)?\.?)(?:\*{0,2})?\s*[:.-]?\s*/i;

function clean(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

function questionNumber(value: string): string | null {
  const trimmed = value.trim().replace(/^#+\s*/, '');
  const match = QUESTION_START.exec(trimmed);
  if (!match) return null;
  // Plain numbered prose is accepted; equation blocks such as "1.25" are not.
  if (!EXPLICIT_QUESTION_START.test(trimmed) && !/^\d+[.)]\s+/.test(trimmed)) return null;
  return match[1];
}

function isExplicitQuestionStart(value: string): boolean {
  return EXPLICIT_QUESTION_START.test(value.trim().replace(/^#+\s*/, ''));
}

function splitOptions(value: string): string[] {
  const normalized = value.replace(/\r?\n/g, ' ');
  const marker = /(?:^|\s)\(([a-dA-D])\)\s*/g;
  const matches = [...normalized.matchAll(marker)];
  if (matches.length === 0) return [];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return normalized.slice(start, end).trim();
  }).filter(Boolean);
}

function append(existing: string, incoming: string): string {
  return clean([existing, clean(incoming)].filter(Boolean).join('\n'));
}

export function assembleOcrPage(input: {
  pageNumber: number;
  bookName: string;
  blocks: OcrBlock[];
  reconciliation: ReconciliationDecision[];
}): PageAssemblyResult {
  const questions: AssembledQuestionDraft[] = [];
  const orphanBlocks: PageAssemblyResult['orphanBlocks'] = [];
  let current: AssembledQuestionDraft | null = null;
  let mode: 'CONTENT' | 'OPTIONS' | 'SOLUTION' = 'CONTENT';
  const firstBody = input.blocks.find((block) =>
    !['header', 'footer', 'title', 'caption', 'image'].includes(block.type) && clean(block.content ?? ''),
  );
  const hasExerciseHeading = input.blocks.some((block) =>
    block.type === 'title' && /\b(?:exercise|questions?)\b/i.test(block.content ?? ''),
  );
  const firstBodyIsPlainQuestion = Boolean(
    firstBody && /^\d+[.)]\s+/.test(clean(firstBody.content ?? '')),
  );
  const allowPlainNumberedQuestions = hasExerciseHeading || firstBodyIsPlainQuestion;

  const finish = () => {
    if (!current) return;
    current.content = clean(current.content);
    current.explanation = clean(current.explanation);
    current.options = current.options.map(clean).filter(Boolean);
    current.type = current.options.length > 0 ? 'SINGLE_CHOICE' : 'SUBJECTIVE';
    if (current.options.length > 0 && current.options.length < 2) {
      current.holdReasons.push('INCOMPLETE_OPTION_SET');
    }
    if (current.content.length < 8) current.holdReasons.push('INCOMPLETE_QUESTION_STEM');
    current.holdReasons = [...new Set(current.holdReasons)];
    current.reviewStatus = current.holdReasons.length > 0 ? 'HOLD' : 'READY_FOR_SEMANTIC_REVIEW';
    questions.push(current);
    current = null;
  };

  for (let blockIndex = 0; blockIndex < input.blocks.length; blockIndex += 1) {
    const block = input.blocks[blockIndex];
    const content = clean(block.content ?? '');
    if (!content || block.type === 'header' || block.type === 'footer') continue;

    const number = questionNumber(content);
    const isExplicitQuestion = isExplicitQuestionStart(content);
    if (number && (isExplicitQuestion || allowPlainNumberedQuestions)) {
      finish();
      current = {
        sourceId: `${input.pageNumber}:${number}`,
        sourceQuestionNumber: number,
        sourcePage: input.pageNumber,
        sourceBlockIndices: [blockIndex],
        bookName: input.bookName,
        content,
        options: [],
        correctAnswer: '',
        explanation: '',
        type: 'SUBJECTIVE',
        tags: [input.bookName, `Source page ${input.pageNumber}`],
        reviewStatus: 'READY_FOR_SEMANTIC_REVIEW',
        holdReasons: [],
      };
      mode = 'CONTENT';
      continue;
    }

    if (block.type === 'title') continue;

    if (!current) {
      if (SOLUTION_START.test(content) || block.type === 'equation') {
        orphanBlocks.push({ blockIndex, content, reason: 'ORPHAN_SOLUTION_OR_CONTINUATION' });
      }
      continue;
    }

    current.sourceBlockIndices.push(blockIndex);
    if (SOLUTION_START.test(content)) {
      mode = 'SOLUTION';
      current.explanation = append(current.explanation, content.replace(SOLUTION_START, ''));
    } else if (ANSWER_START.test(content)) {
      current.correctAnswer = clean(content.replace(ANSWER_START, ''));
    } else {
      const options = splitOptions(content);
      if (OPTION_START.test(content) || options.length > 0) {
        mode = 'OPTIONS';
        current.options.push(...(options.length > 0 ? options : [content.replace(OPTION_START, '')]));
      } else if (mode === 'SOLUTION') {
        current.explanation = append(current.explanation, content);
      } else if (mode === 'OPTIONS' && block.type === 'equation') {
        current.options[current.options.length - 1] = append(current.options.at(-1) ?? '', content);
      } else {
        current.content = append(current.content, content);
      }
    }
  }
  finish();

  const decisions = new Map(
    input.reconciliation.map((item) => [`${item.pageNumber}:${item.blockIndex}`, item]),
  );
  for (const question of questions) {
    for (const blockIndex of question.sourceBlockIndices) {
      const decision = decisions.get(`${input.pageNumber}:${blockIndex}`);
      if (decision?.reviewStatus === 'HOLD_FOR_RECONCILIATION') {
        question.holdReasons.push(`FORMULA_PROVIDER_DISAGREEMENT:block-${blockIndex}`);
      }
    }
    question.holdReasons = [...new Set(question.holdReasons)];
    question.reviewStatus = question.holdReasons.length > 0 ? 'HOLD' : 'READY_FOR_SEMANTIC_REVIEW';
  }

  return { questions, orphanBlocks };
}

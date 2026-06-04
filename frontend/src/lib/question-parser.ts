type QuestionType = 'MCQ' | 'ASSERTION_REASONING' | 'CASE_STUDY' | 'VERY_SHORT_ANSWER' | 'SHORT_ANSWER' | 'LONG_ANSWER' | 'FILL_IN_THE_BLANK';

export interface ParsedQuestion {
  type: QuestionType;
  number?: number;
  questionText: string;
  options?: { label: string; text: string }[];
  correctOption?: string | null;
  assertion?: string;
  reasoning?: string;
  passage?: string;
  subQuestions?: { question: string; options?: { label: string; text: string }[] }[];
  solution?: string;
  tags?: string[];
  sourceText: string;
  confidence: number;
}

const META_TAG_PATTERNS = [
  /\[CBSE\s+[\d\s()/]+\]/gi,
  /\[NCERT\s+Exemplar\]/gi,
  /\[Competency\s+Based\s+Question\]/gi,
  /\[CBSE\s+Term[-\s]?\d,[\s\d-]+\([\d\s()/]+\)\]/gi,
];

function extractMetaTags(text: string): { cleaned: string; tags: string[] } {
  const tags: string[] = [];
  let cleaned = text;
  for (const pattern of META_TAG_PATTERNS) {
    const matches = cleaned.match(pattern);
    if (matches) {
      for (const m of matches) {
        const tag = m
          .replace(/[[\]]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
        if (tag && !tags.includes(tag)) tags.push(tag);
      }
      cleaned = cleaned.replace(pattern, '');
    }
  }
  return { cleaned: cleaned.trim(), tags };
}

const PAGE_PATTERNS = [
  /^\d{1,4}$/,
  /^\[?\d{1,4}\]?$/,
  /^\|\s*\d{1,4}\s*\|$/,
  /^Page\s+\d+/i,
  /^\d{1,4}\s+of\s+\d+/i,
  /^-\s*\d{1,4}\s*-$/,
];

function isPageNumber(text: string): boolean {
  const t = text.trim();
  return PAGE_PATTERNS.some(p => p.test(t));
}

function isOptionLine(line: string): boolean {
  const t = line.trim();
  if (/^\([a-d]\)\s/i.test(t)) return true;
  if (/^[a-d][.)]\s/i.test(t)) return true;
  return false;
}

function parseOptionLine(line: string): { label: string; text: string } | null {
  const t = line.trim();
  let match = t.match(/^\(([a-d])\)\s+(.*)/i);
  if (match) return { label: match[1].toUpperCase(), text: match[2].trim() };
  match = t.match(/^([a-d])[.)]\s+(.*)/i);
  if (match) return { label: match[1].toUpperCase(), text: match[2].trim() };
  return null;
}

function detectOptionLines(lines: string[]): { lines: string[]; rest: string[] } {
  const optionLines: string[] = [];
  const rest: string[] = [];
  let inOptions = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (isOptionLine(trimmed)) {
      optionLines.push(trimmed);
      inOptions = true;
    } else if (inOptions) {
      optionLines.push(trimmed);
    } else {
      rest.push(line);
    }
  }

  if (optionLines.length < 2) return { lines: [], rest: lines };
  const parsed = optionLines.filter(l => isOptionLine(l));
  if (parsed.length < 2) return { lines: [], rest: lines };
  return { lines: optionLines, rest };
}

function parseOptions(optionLines: string[]): { label: string; text: string }[] {
  const result: { label: string; text: string }[] = [];
  const buffers: { label: string; texts: string[] }[] = [];
  let current: { label: string; texts: string[] } | null = null;

  for (const line of optionLines) {
    const parsed = parseOptionLine(line);
    if (parsed) {
      if (current) buffers.push(current);
      current = { label: parsed.label, texts: [parsed.text] };
    } else if (current) {
      current.texts.push(line.trim());
    }
  }
  if (current) buffers.push(current);

  for (const b of buffers) {
    result.push({ label: b.label, text: b.texts.join(' ').trim() });
  }
  return result;
}

function containsAssertionReasoning(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    (lower.includes('assertion (a):') || lower.includes('assertion:')) &&
    (lower.includes('reason (r):') || lower.includes('reason:'))
  );
}

function extractAssertionReasoning(text: string): { assertion: string; reasoning: string } | null {
  const lines = text.split('\n');
  let assertion = '';
  let reasoning = '';
  let inAssertion = false;
  let inReasoning = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^assertion\s*\(a\)\s*:/i.test(trimmed)) {
      inAssertion = true; inReasoning = false;
      assertion = trimmed.replace(/^assertion\s*\(a\)\s*:\s*/i, '').trim();
      continue;
    }
    if (/^reason\s*\(r\)\s*:/i.test(trimmed)) {
      inReasoning = true; inAssertion = false;
      reasoning = trimmed.replace(/^reason\s*\(r\)\s*:\s*/i, '').trim();
      continue;
    }
    if (inAssertion && !isOptionLine(trimmed) && !/^reason/i.test(trimmed)) {
      assertion += ' ' + trimmed;
    }
    if (inReasoning && !isOptionLine(trimmed) && !/^assertion/i.test(trimmed)) {
      reasoning += ' ' + trimmed;
    }
  }

  if (assertion || reasoning) return { assertion: assertion.trim(), reasoning: reasoning.trim() };
  return null;
}

function hasCaseStudyPattern(lines: string[]): boolean {
  const text = lines.join('\n');
  const hasPassage = lines.some(l => l.trim().length > 100) || text.split('\n\n').length > 3;
  const hasSubQuestions = text.split('\n').some(l => /^\(?(i|ii|iii|iv|v|vi|vii|viii|ix|x)\)?\s/.test(l.trim()));
  if (hasPassage && hasSubQuestions) return true;
  return false;
}

function extractCaseStudy(lines: string[]): { passage: string; subQuestions: { question: string; options?: { label: string; text: string }[] }[] } | null {
  const text = lines.join('\n');
  const subQBlocks = text.split(/\n(?=\(?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)?\s)/);
  if (subQBlocks.length < 2) return null;
  const passage = subQBlocks[0].trim();
  const subQuestions = subQBlocks.slice(1).map(block => {
    const subLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const firstLine = subLines[0] || '';
    const questionText = firstLine.replace(/^\(?(i|ii|iii|iv|v|vi|vii|viii|ix|x)\)?\s+/, '').trim();
    const optLines = subLines.slice(1).filter(l => isOptionLine(l));
    const options = optLines.length >= 2 ? parseOptions(subLines.slice(1)) : undefined;
    return { question: questionText || block.substring(0, 100), options };
  });
  return { passage, subQuestions };
}

function extractQuestionNumber(line: string): number | undefined {
  const match = line.match(/^(\d+)[.)]\s/);
  if (match) return parseInt(match[1]);
  const match2 = line.match(/^Q\.?\s*(\d+)/i);
  if (match2) return parseInt(match2[1]);
  return undefined;
}

function estimateQuestionType(text: string, hasOptions: boolean): { type: QuestionType; confidence: number } {
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;

  if (containsAssertionReasoning(text)) return { type: 'ASSERTION_REASONING', confidence: 0.9 };
  if (charCount > 500 && text.split('\n').length > 8) return { type: 'CASE_STUDY', confidence: 0.7 };
  if (hasOptions) return { type: 'MCQ', confidence: 0.85 };
  if (text.includes('_____') || text.includes('___')) return { type: 'FILL_IN_THE_BLANK', confidence: 0.5 };
  if (wordCount < 20) return { type: 'VERY_SHORT_ANSWER', confidence: 0.6 };
  if (wordCount < 50) return { type: 'SHORT_ANSWER', confidence: 0.6 };
  return { type: 'LONG_ANSWER', confidence: 0.5 };
}

interface AnswersMap { [questionNumber: number]: string; }
interface SolutionsMap { [questionNumber: number]: string; }

function parseAnswersSection(blocks: string[]): AnswersMap {
  const answers: AnswersMap = {};
  for (const block of blocks) {
    const lines = block.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\d+)\s*[.)]\s*\(?([a-zA-Z])\)?/);
      if (match) answers[parseInt(match[1])] = match[2].toUpperCase();
    }
  }
  return answers;
}

function parseSolutionsSection(blocks: string[]): SolutionsMap {
  const solutions: SolutionsMap = {};
  let currentNumber: number | null = null;
  const lines: string[] = [];

  for (const block of blocks) {
    const blockLines = block.split('\n');
    for (const line of blockLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const numMatch = trimmed.match(/^(\d+)\.\s/);
      if (numMatch) {
        if (currentNumber !== null && lines.length > 0) {
          solutions[currentNumber] = lines.join('\n').trim();
        }
        currentNumber = parseInt(numMatch[1]);
        lines.length = 0;
        const afterNum = trimmed.replace(/^\d+\.\s*/, '');
        if (afterNum && !/^(we have|solution|sol|given|the function)/i.test(afterNum)) {
          lines.push(afterNum);
        }
      } else if (currentNumber !== null) {
        if (trimmed.startsWith('##')) {
          if (currentNumber !== null && lines.length > 0) {
            solutions[currentNumber] = lines.join('\n').trim();
          }
          currentNumber = null;
          lines.length = 0;
        } else {
          lines.push(trimmed);
        }
      }
    }
  }
  if (currentNumber !== null && lines.length > 0) {
    solutions[currentNumber] = lines.join('\n').trim();
  }
  return solutions;
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  return /^##\s*(answers|solutions|answer|solution|answer key)/i.test(trimmed) ||
    /^\*\*(answers|solutions)\*\*$/i.test(trimmed);
}

function isAnySectionHeader(line: string): boolean {
  return line.trim().startsWith('##') || line.trim().startsWith('**');
}

// Additional solution indicator patterns (for inline/non-section solutions)
const SOLUTION_HEADER_PATTERNS = [
  /^##\s*(solution|solutions|answer|answers|answer\s+key|answerkey)/i,
  /^\*\*(solutions?|answers?)\s*\*\*:?$/i,
  /^SOLUTION/i,
  /^ANSWER\s+KEY/i,
  /^HINTS?\s+(AND\s+)?SOLUTIONS?/i,
  /^EXERCISE.*SOLUTION/i,
];

const SOLUTION_INLINE_PATTERNS = [
  /^(?:sol|solution|sol\.|solution:)/i,
  /^(?:ans|answer|ans\.|answer:)/i,
  /^correct\s+option/i,
  /^hence\s+(option|choice)/i,
];

export function parseQuestionsFromMarkdown(markdown: string): ParsedQuestion[] {
  const rawBlocks = markdown.split(/\n\n+/).map(b => b.trim()).filter(Boolean);

  // Strip page numbers
  const blocks = rawBlocks.filter(b => {
    const lines = b.split('\n').filter(l => l.trim());
    const firstLine = lines[0]?.trim() || '';
    if (lines.length === 1 && isPageNumber(firstLine)) return false;
    if (lines.length === 1 && firstLine.startsWith('[') && firstLine.endsWith(']')) return false;
    return true;
  });

  const results: ParsedQuestion[] = [];
  let answersMap: AnswersMap = {};
  let solutionsMap: SolutionsMap = {};

  const answerBlocks: string[] = [];
  const solutionBlocks: string[] = [];
  let inAnswers = false;
  let inSolutions = false;

  // First pass: aggressively extract all solution/answer content
  // Detect ANY block that looks like a solution section (not just ## headers)
  const questionBlocks: string[] = [];
  for (const block of blocks) {
    const firstLine = block.split('\n')[0].trim();
    const firstLineLower = firstLine.toLowerCase();

    const isSolutionHeader = SOLUTION_HEADER_PATTERNS.some(p => p.test(firstLine));
    const isSolutionInline = SOLUTION_INLINE_PATTERNS.some(p => p.test(firstLineLower));

    if (isSectionHeader(firstLine) || isSolutionHeader) {
      if (/answers|answer\s+key/i.test(firstLine)) {
        answerBlocks.push(block);
      } else {
        solutionBlocks.push(block);
      }
      inAnswers = /answers|answer key/i.test(firstLine);
      inSolutions = !inAnswers && (isSectionHeader(firstLine) || isSolutionHeader);
      continue;
    }
    if (inAnswers) { answerBlocks.push(block); continue; }
    if (inSolutions) { solutionBlocks.push(block); continue; }

    // Skip blocks that are purely numbered answer keys (e.g. "1. A  2. C  3. D")
    if (block.split('\n').every(l => /^\d+\s*[\.\)]\s*[A-Da-d]\s*$/.test(l.trim()))) {
      answerBlocks.push(block);
      continue;
    }
    questionBlocks.push(block);
  }

  // Pre-process: merge multi-block questions
  const mergedBlocks: string[] = [];
  for (const block of questionBlocks) {
    const firstLine = block.split('\n')[0].trim();

    // Section headers
    if (isAnySectionHeader(firstLine)) {
      if (isSectionHeader(firstLine)) {
        if (/answers|answer key/i.test(firstLine)) {
          inAnswers = true; inSolutions = false;
        } else {
          inSolutions = true; inAnswers = false;
        }
      } else {
        inAnswers = false; inSolutions = false;
      }

      if (inAnswers || inSolutions) {
        if (inAnswers) answerBlocks.push(block);
        if (inSolutions) solutionBlocks.push(block);
      } else if (firstLine.startsWith('## ') && mergedBlocks.length > 0) {
        mergedBlocks[mergedBlocks.length - 1] += '\n\n' + block;
      }
      continue;
    }

    if (inAnswers) {
      answerBlocks.push(block);
      continue;
    }
    if (inSolutions) {
      solutionBlocks.push(block);
      continue;
    }

    // Questions section
    if (mergedBlocks.length === 0 || extractQuestionNumber(firstLine) !== undefined) {
      mergedBlocks.push(block);
    } else {
      mergedBlocks[mergedBlocks.length - 1] += '\n\n' + block;
    }
  }

  answersMap = parseAnswersSection(answerBlocks);
  solutionsMap = parseSolutionsSection(solutionBlocks);

  for (const block of mergedBlocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    const qNumber = extractQuestionNumber(firstLine);

    // Strip metadata from the full block text
    const { cleaned: blockCleaned, tags: blockTags } = extractMetaTags(block);

    const cleanedFirst = firstLine.replace(/^(\d+[.)]\s*)/, '').trim();
    const { cleaned: stemCleaned } = extractMetaTags(cleanedFirst);

    // Check for answer/solution at end of question line (e.g. "Solve for x. [Ans: 5]")
    let inlineAnswer = '';
    const ansMatch = blockCleaned.match(/\[(?:Ans|Answer):\s*([^\]]+)\]/i);
    if (ansMatch) {
      inlineAnswer = ansMatch[1].trim();
    }

    // Check for inline Sol. (VSA questions with embedded solution)
    let inlineSolution = '';
    let questionLines = lines;
    const solIdx = lines.findIndex(l => /^sol[.\s]/i.test(l.trim()) || /^solution[.\s]/i.test(l.trim()) || l.trim().startsWith('Sol.'));
    if (solIdx >= 0) {
      inlineSolution = lines.slice(solIdx + 1).join('\n').trim() || lines[solIdx].replace(/^sol[.\s]/i, '').trim();
      questionLines = lines.slice(0, solIdx);
    }

    if (questionLines.length === 0) continue;

    if (containsAssertionReasoning(block)) {
      const ar = extractAssertionReasoning(block);
      const optLines = questionLines.filter(l => isOptionLine(l));
      const options = optLines.length >= 2 ? parseOptions(optLines) : [
        { label: 'A', text: 'Both A and R are true, and R is the correct explanation of A' },
        { label: 'B', text: 'Both A and R are true, but R is NOT the correct explanation of A' },
        { label: 'C', text: 'A is true, but R is false' },
        { label: 'D', text: 'A is false, but R is true' },
      ];

      results.push({
        type: 'ASSERTION_REASONING',
        number: qNumber,
        questionText: stemCleaned,
        assertion: ar?.assertion || '',
        reasoning: ar?.reasoning || '',
        options,
        correctOption: qNumber !== undefined ? (answersMap[qNumber] || null) : null,
        solution: qNumber !== undefined ? (solutionsMap[qNumber] || inlineSolution) : inlineSolution,
        sourceText: block,
        tags: blockTags,
        confidence: 0.9,
      });
      continue;
    }

    if (hasCaseStudyPattern(questionLines)) {
      const cs = extractCaseStudy(questionLines);
      if (cs) {
        results.push({
          type: 'CASE_STUDY',
          number: qNumber,
          questionText: stemCleaned,
          passage: cs.passage,
          subQuestions: cs.subQuestions,
          correctOption: null,
          solution: qNumber !== undefined ? (solutionsMap[qNumber] || inlineSolution) : inlineSolution,
          sourceText: block,
          tags: blockTags,
          confidence: 0.7,
        });
        continue;
      }
    }

    const { lines: optLines, rest } = detectOptionLines(questionLines);
    const hasOptions = optLines.length >= 2;
    const options = hasOptions ? parseOptions(optLines) : undefined;
    const estimated = estimateQuestionType(block, hasOptions);

    // Build question text: remove number prefix, metadata, and options
    const qTextParts: string[] = [];
    for (const l of rest) {
      if (l === firstLine) {
        qTextParts.push(stemCleaned);
      } else {
        const { cleaned: lineCleaned } = extractMetaTags(l);
        if (lineCleaned) qTextParts.push(lineCleaned);
      }
    }
    const questionText = qTextParts.join('\n').trim() || stemCleaned;

    results.push({
      type: estimated.type,
      number: qNumber,
      questionText,
      options,
      correctOption: qNumber !== undefined ? (answersMap[qNumber] || inlineAnswer || null) : (inlineAnswer || null),
      solution: qNumber !== undefined ? (solutionsMap[qNumber] || inlineSolution) : inlineSolution,
      sourceText: block,
      tags: blockTags,
      confidence: hasOptions ? 0.85 : estimated.confidence,
    });
  }

  return results;
}

export function createQuestionFromParsed(parsed: ParsedQuestion, templateId: string): AuthoredQuestion {
  const base: AuthoredQuestion = {
    id: templateId,
    type: parsed.type,
    question: parsed.questionText,
    solution: parsed.solution || '',
    tags: parsed.tags || [],
  };

  if (parsed.type === 'MCQ' || parsed.type === 'ASSERTION_REASONING') {
    base.options = parsed.options || [
      { label: 'A', text: '' }, { label: 'B', text: '' },
      { label: 'C', text: '' }, { label: 'D', text: '' },
    ];
    base.correctOption = parsed.correctOption || null;
  }

  if (parsed.type === 'ASSERTION_REASONING') {
    base.assertion = parsed.assertion || '';
    base.reasoning = parsed.reasoning || '';
  }

  if (parsed.type === 'CASE_STUDY') {
    base.passage = parsed.passage || '';
    base.subQuestions = parsed.subQuestions?.map(sq => ({
      id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: sq.question,
      options: sq.options || [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
      correctOption: null,
      solution: '',
    })) || [];
  }

  return base;
}

export interface AuthoredQuestion {
  id: string;
  type: QuestionType;
  question: string;
  solution: string;
  tags?: string[];
  options?: { label: string; text: string }[];
  correctOption?: string | null;
  assertion?: string;
  reasoning?: string;
  passage?: string;
  subQuestions?: { id: string; question: string; options: { label: string; text: string }[]; correctOption: string | null; solution: string }[];
}

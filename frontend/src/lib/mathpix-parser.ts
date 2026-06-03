/**
 * Clean common Mathpix OCR markdown artifacts before parsing.
 * Handles delimiter normalization, broken LaTeX, unicode math, and whitespace.
 */
export function cleanMathpixMarkdown(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Normalize math delimiters
  //    \(...\) → $...$  and  \[...\] → $$...$$
  cleaned = cleaned.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  cleaned = cleaned.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');

  // 2. Fix common Mathpix broken LaTeX patterns
  //    "aligned" without surrounding $$ → wrap it
  cleaned = cleaned.replace(/([^$])\s*\\begin\{aligned\}/g, '$1$$\n\\begin{aligned}');
  cleaned = cleaned.replace(/\\end\{aligned\}\s*([^$])/g, '\\end{aligned}\n$$$1');
  //    Fix \begin{cases} without math mode
  cleaned = cleaned.replace(/([^$])\s*\\begin\{cases\}/g, '$1$$\n\\begin{cases}');
  cleaned = cleaned.replace(/\\end\{cases\}\s*([^$])/g, '\\end{cases}\n$$$1');

  // 3. Convert Unicode math symbols to LaTeX
  const unicodeToLatex: [RegExp, string][] = [
    [/×/g, '\\times '],
    [/÷/g, '\\div '],
    [/−/g, '-'],
    [/±/g, '\\pm '],
    [/∓/g, '\\mp '],
    [/√/g, '\\sqrt{}'],
    [/∛/g, '\\sqrt[3]{}'],
    [/∞/g, '\\infty '],
    [/π/g, '\\pi '],
    [/θ/g, '\\theta '],
    [/α/g, '\\alpha '],
    [/β/g, '\\beta '],
    [/γ/g, '\\gamma '],
    [/δ/g, '\\delta '],
    [/Δ/g, '\\Delta '],
    [/Σ/g, '\\Sigma '],
    [/∫/g, '\\int '],
    [/∑/g, '\\sum '],
    [/∏/g, '\\prod '],
    [/∂/g, '\\partial '],
    [/∇/g, '\\nabla '],
    [/∈/g, '\\in '],
    [/∉/g, '\\notin '],
    [/∋/g, '\\ni '],
    [/⊂/g, '\\subset '],
    [/⊃/g, '\\supset '],
    [/⊆/g, '\\subseteq '],
    [/⊇/g, '\\supseteq '],
    [/∪/g, '\\cup '],
    [/∩/g, '\\cap '],
    [/∧/g, '\\land '],
    [/∨/g, '\\lor '],
    [/¬/g, '\\lnot '],
    [/∀/g, '\\forall '],
    [/∃/g, '\\exists '],
    [/∠/g, '\\angle '],
    [/⊥/g, '\\perp '],
    [/∥/g, '\\parallel '],
    [/≅/g, '\\cong '],
    [/≈/g, '\\approx '],
    [/≠/g, '\\neq '],
    [/≡/g, '\\equiv '],
    [/≤/g, '\\leq '],
    [/≥/g, '\\geq '],
    [/→/g, '\\to '],
    [/←/g, '\\leftarrow '],
    [/⇒/g, '\\Rightarrow '],
    [/⇔/g, '\\Leftrightarrow '],
    [/↦/g, '\\mapsto '],
    [/°C/g, '{}^\\circ C'],
    [/°/g, '{}^\\circ '],
    [/²/g, '^2'],
    [/³/g, '^3'],
  ];
  for (const [pattern, replacement] of unicodeToLatex) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 4. Remove redundant LaTeX braces (e.g., ${x}$ → $x$, $${...}$$ → $$...$$)
  cleaned = cleaned.replace(/\$\{([^}]+)\}\$/g, '$$$1$$');
  cleaned = cleaned.replace(/\$\$\{([^}]+)\}\$\$/g, '$$$$1$$$$');

  // 5. Fix whitespace around math delimiters
  cleaned = cleaned.replace(/\$\s+/g, '$');
  cleaned = cleaned.replace(/\s+\$/g, '$');
  cleaned = cleaned.replace(/\$\$\s+/g, '$$');
  cleaned = cleaned.replace(/\s+\$\$/g, '$$');

  // 6. Normalize multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

export interface ParsedOption {
  label: string;
  text: string;
}

export interface ParsedSubQuestion {
  number: string;
  text: string;
  options: ParsedOption[] | null;
}

export interface ParsedQuestion {
  number: string | null;
  type: string;
  question: string;
  options: ParsedOption[] | null;
  correctOption: string | null;
  assertion: string | null;
  reasoning: string | null;
  passage: string | null;
  subQuestions: ParsedSubQuestion[] | null;
  solution: string | null;
  tags: string[];
  difficulty: string;
  sourcePage: number;
  rawText: string;
}

const TAG_PATTERNS: [RegExp, (match: RegExpMatchArray) => string[]][] = [
  [/\[CBSE\s*(\d{4})\s*(?:Term[-\s]*(\d))?\]/i, (m) => { const t = ["CBSE", "PYQ", m[1]]; if (m[2]) t.push(`TERM_${m[2]}`); return t; }],
  [/\[NCERT\s*Exemplar\]/i, () => ["NCERT", "EXEMPLAR"]],
  [/\[PYQ\]/i, () => ["PYQ"]],
  [/\[Competency\s*Based\s*(?:Question)?\]/i, () => ["COMPETENCY"]],
  [/\[NDA\]/i, () => ["NDA", "PYQ"]],
  [/\[JEE\s*Main\]/i, () => ["JEE_MAIN", "PYQ"]],
  [/\[CUET\]/i, () => ["CUET", "PYQ"]],
];

function extractTags(text: string): { tags: string[]; cleaned: string } {
  const tags: string[] = [];
  let cleaned = text;
  for (const [pattern, fn] of TAG_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      tags.push(...fn(match));
      cleaned = cleaned.replace(pattern, "").trim();
    }
  }
  return { tags: [...new Set(tags.filter(Boolean))], cleaned };
}

function isQuestionNumberLine(line: string): { number: string | null; isQuestion: boolean; textAfter: string } {
  const trimmed = line.trim();
  const m = trimmed.match(/^(?:Q\.?\s*)?(\d{1,3})[\.\)\s:]\s*(.*)$/);
  if (m) {
    return { number: m[1], isQuestion: true, textAfter: m[2] };
  }
  return { number: null, isQuestion: false, textAfter: '' };
}

function isOptionLine(line: string): { label: string; text: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^\(?([A-Da-d])\)?[\.\)\s]+\s*(.+)$/);
  if (m) {
    return { label: m[1].toUpperCase(), text: m[2].trim() };
  }
  return null;
}

function extractCorrectOption(solutionText: string): string | null {
  const text = solutionText.trim();
  console.log(`[extractCorrectOption] Input: "${text.substring(0, 100)}"`);
  const patterns: [RegExp, string][] = [
    [/^(?:correct\s*option|answer|ans(?:wer)?)\s*[:\s]*\(?([A-Da-d])\)?/i, 'answer prefix'],
    [/^(?:option|opt)\s*([A-Da-d])\s*(?:is|:|correct)/i, 'option X is'],
    [/^\(?([A-Da-d])\)?\s*(?:is\s*correct|is\s*the\s*answer)/i, 'X is correct'],
    [/^(?:hence|therefore|thus)\s*,?\s*(?:option|opt)\s*([A-Da-d])/i, 'hence option'],
    [/^\(?([A-Da-d])\)?\s*$/, 'standalone (X)'],
    [/^\(?([A-Da-d])\)?\s*(?:\.|:|,)/, '(X). or (X):'],
    [/\$([A-Da-d])\$/, 'latex $X$'],
    [/\\\(([A-Da-d])\\\)/, 'latex \\(X\\)'],
    [/\b(?:correct|answer|ans)\b\s*[:\s]*\(?([A-Da-d])\)?/i, 'anywhere answer'],
    [/\boption\s*([A-Da-d])\b/i, 'anywhere option'],
  ];
  for (const [pattern, name] of patterns) {
    const match = text.match(pattern);
    if (match) {
      console.log(`[extractCorrectOption] Matched: ${name} -> ${match[1].toUpperCase()}`);
      return match[1].toUpperCase();
    }
  }
  console.log(`[extractCorrectOption] No match found`);
  return null;
}

function detectDifficulty(question: string, options: { label: string; text: string }[], solution: string | null): string {
  const combined = `${question} ${options.map(o => o.text).join(' ')} ${solution || ''}`.toLowerCase();
  
  const hardIndicators = [
    /prove\s*that|show\s*that|demonstrate|establish|derive/,
    /hence\s*show|consequently|therefore\s*prove/,
    /using\s*(?:first|second)\s*principle|by\s*definition/,
    /mathematical\s*induction|bijection|isomorphism/,
    /epsilon|delta|convergence|divergence|continuity/,
    /differential\s*equation|partial\s*derivative|integration\s*by\s*parts/,
    /matrix\s*inverse|eigenvalue|characteristic\s*polynomial/,
    /combinatorics|permutation\s*and\s*combination|binomial\s*theorem/,
  ];
  
  const mediumIndicators = [
    /find\s*the\s*value|calculate|evaluate|solve|determine/,
    /if\s*.*then\s*find|given\s*.*find/,
    /equation\s*of|slope|intercept|vertex/,
    /probability|mean|median|mode|variance/,
    /distance\s*between|midpoint|area\s*of|volume\s*of/,
    /simplify|express|rewrite|convert/,
  ];
  
  const easyIndicators = [
    /what\s*is|which\s*of|identify|state|define/,
    /true\s*or\s*false|fill\s*in\s*the\s*blank/,
    /direct\s*formula|substitute|plug\s*in/,
  ];
  
  for (const pattern of hardIndicators) {
    if (pattern.test(combined)) return "HARD";
  }
  
  for (const pattern of mediumIndicators) {
    if (pattern.test(combined)) return "MEDIUM";
  }
  
  for (const pattern of easyIndicators) {
    if (pattern.test(combined)) return "EASY";
  }
  
  if (options.length >= 4) return "MEDIUM";
  if (solution && solution.length > 200) return "HARD";
  if (question.length < 50) return "EASY";
  
  return "MEDIUM";
}

function isSolutionLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:Sol(?:ution)?|Ans(?:wer)?|Sol\.|Ans\.)\s*[\d]*\s*[:\s]/i.test(trimmed) ||
         /^\*\*(?:Solution|Answer)\s*[\d]*\*\*/i.test(trimmed);
}

function isNoise(line: string): boolean {
  const trimmed = line.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length < 5) return true;
  if (/^(?:Page|Pg)\s*\d+/i.test(trimmed)) return true;
  if (/^##\s+/i.test(trimmed)) return true;
  if (/^(?:Choose|Select|Write|Answer)\s+(?:and\s+)?(?:write|select)?/i.test(trimmed)) return true;
  if (/^(?:Solutions?|Answers?|Answer\s*Key)/i.test(trimmed)) return true;
  return false;
}

function detectType(question: string, options: { label: string; text: string }[]): string {
  if (options.length >= 2) return "MCQ";
  if (/assertion|reason|statement\s*1|statement\s*2/i.test(question)) return "ASSERTION_REASONING";
  if (/case\s*study|passage|read\s*the\s*following/i.test(question)) return "CASE_STUDY";
  if (/fill\s*in\s*the\s*blank/i.test(question)) return "FILL_IN_THE_BLANK";
  if (/true\s*or\s*false/i.test(question)) return "VERY_SHORT_ANSWER";
  if (/prove\s*that|show\s*that|demonstrate/i.test(question)) return "LONG_ANSWER";
  if (/find\s*the\s*value|calculate|evaluate|solve/i.test(question)) return "SHORT_ANSWER";
  return "SHORT_ANSWER";
}

export function parseMathpixMarkdown(
  pages: { pageNumber: number; rawMarkdown: string }[],
  options?: { solutionPages?: { pageNumber: number; rawMarkdown: string }[] }
): ParsedQuestion[] {
  const allQuestions: ParsedQuestion[] = [];
  for (const page of pages) {
    const questions = parseQuestionPage(page.rawMarkdown, page.pageNumber);
    allQuestions.push(...questions);
  }
  if (options?.solutionPages && options.solutionPages.length > 0) {
    const solutions = parseSolutionPages(options.solutionPages);
    console.log(`[PARSER] Found ${solutions.length} solutions from solution pages`);
    console.log(`[PARSER] Solution numbers: ${solutions.map(s => s.number).join(', ')}`);
    console.log(`[PARSER] Question numbers: ${allQuestions.filter(q => q.number).map(q => q.number).join(', ')}`);
    for (const q of allQuestions) {
      if (q.number) {
        const match = solutions.find(s => s.number === q.number);
        if (match) {
          q.solution = match.solutionText;
          const correctOpt = extractCorrectOption(match.solutionText);
          if (correctOpt) {
            q.correctOption = correctOpt;
          }
        }
      }
    }
  }
  return allQuestions;
}

function parseSolutionPages(solutionPages: { pageNumber: number; rawMarkdown: string }[]): { number: string; solutionText: string }[] {
  const solutions: { number: string; solutionText: string }[] = [];
  for (const page of solutionPages) {
    const pageSolutions = parseSolutionPage(page.rawMarkdown);
    solutions.push(...pageSolutions);
  }
  return solutions;
}

function parseSolutionPage(markdown: string): { number: string; solutionText: string }[] {
  const solutions: { number: string; solutionText: string }[] = [];
  const lines = markdown.split('\n');

  let currentNumber: string | null = null;
  let currentLines: string[] = [];

  function finalize() {
    if (currentNumber && currentLines.length > 0) {
      solutions.push({
        number: currentNumber,
        solutionText: currentLines.join('\n').trim(),
      });
    }
    currentNumber = null;
    currentLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed) && trimmed.length < 5) continue;

    // Match patterns: "1. ", "1) ", "Q1. ", "Q1) ", "Sol 1. ", "Sol. 1: ", "Ans 1. ", "Solution 1. "
    const solMatch = trimmed.match(/^(?:(?:Q\.?\s*)?(?:Sol(?:ution)?\.?\s*|Ans(?:wer)?\.?\s*))?(\d{1,3})[\.\)\s:]\s*(.*)$/);
    if (solMatch && solMatch[1]) {
      finalize();
      currentNumber = solMatch[1];
      const textAfter = solMatch[2].trim();
      if (textAfter.length > 0) {
        currentLines.push(textAfter);
      }
      continue;
    }

    if (currentNumber && trimmed.length > 0) {
      currentLines.push(trimmed);
    }
  }

  finalize();
  return solutions;
}

function parseQuestionPage(markdown: string, pageNumber: number): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const lines = markdown.split('\n');
  
  let currentNumber: string | null = null;
  let currentQuestionLines: string[] = [];
  let currentOptions: { label: string; text: string }[] = [];
  let currentSolution: string[] = [];
  let inSolutionSection = false;
  let collectingSolution = false;
  let solutionSectionLines: string[] = [];

  function finalizeQuestion() {
    if (currentQuestionLines.length === 0 && currentOptions.length === 0) return;
    
    const questionText = currentQuestionLines.join('\n').trim();
    if (questionText.length < 10 && currentOptions.length === 0) return;

    const { tags, cleaned } = extractTags(questionText);
    const finalQuestion = cleaned.replace(/^##\s+.+$/gm, '').trim();
    
    if (finalQuestion.length < 5 && currentOptions.length === 0) return;

    const solutionText = currentSolution.length > 0 ? currentSolution.join('\n').trim() : null;
    const type = detectType(finalQuestion, currentOptions);
    const difficulty = detectDifficulty(finalQuestion, currentOptions, solutionText);
    const correctOption = solutionText ? extractCorrectOption(solutionText) : null;

    questions.push({
      number: currentNumber,
      type,
      question: finalQuestion || (currentOptions.length > 0 ? 'Multiple choice question' : ''),
      options: currentOptions.length >= 2 ? currentOptions : null,
      correctOption,
      assertion: null,
      reasoning: null,
      passage: null,
      subQuestions: null,
      solution: solutionText,
      tags,
      difficulty,
      sourcePage: pageNumber,
      rawText: currentQuestionLines.join('\n'),
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(?:##\s*)?(?:Solutions?|Answers?|Answer\s*Key)/i.test(trimmed)) {
      finalizeQuestion();
      inSolutionSection = true;
      continue;
    }
    if (inSolutionSection) {
      if (/^(?:##\s*)?(?:SECTION|Chapter|Exercise)/i.test(trimmed)) {
        inSolutionSection = false;
      } else {
        solutionSectionLines.push(trimmed);
      }
      continue;
    }

    if (isNoise(trimmed)) continue;

    if (isSolutionLine(trimmed)) {
      collectingSolution = true;
      currentSolution.push(trimmed.replace(/^(?:Sol(?:ution)?|Ans(?:wer)?|Sol\.|Ans\.)\s*[\d]*\s*[:\s]*/i, '').replace(/^\*\*(?:Solution|Answer)\s*[\d]*\*\*\s*[:\s]*/i, ''));
      continue;
    }

    if (collectingSolution) {
      const optCheck = isOptionLine(trimmed);
      const qCheck = isQuestionNumberLine(trimmed);
      if (qCheck.isQuestion || (optCheck && currentQuestionLines.length === 0)) {
        collectingSolution = false;
      } else {
        currentSolution.push(trimmed);
        continue;
      }
    }

    const qCheck = isQuestionNumberLine(trimmed);
    if (qCheck.isQuestion) {
      finalizeQuestion();
      currentNumber = qCheck.number;
      currentOptions = [];
      currentSolution = [];
      collectingSolution = false;
      const textAfter = qCheck.textAfter || '';
      if (textAfter) {
        currentQuestionLines = [textAfter];
      } else {
        currentQuestionLines = [];
      }
      continue;
    }

    const optCheck = isOptionLine(trimmed);
    if (optCheck) {
      currentOptions.push({ label: optCheck.label, text: optCheck.text });
      continue;
    }

    if (trimmed.length > 0) {
      currentQuestionLines.push(trimmed);
    }
  }

  finalizeQuestion();

  if (solutionSectionLines.length > 0) {
    const sectionSolutions = parseSolutionLines(solutionSectionLines);
    for (const q of questions) {
      if (q.number) {
        const match = sectionSolutions.find(s => s.number === q.number);
        if (match) {
          q.solution = match.solutionText;
          const correctOpt = extractCorrectOption(match.solutionText);
          if (correctOpt) {
            q.correctOption = correctOpt;
          }
        }
      }
    }
  }

  return questions;
}

function parseSolutionLines(lines: string[]): { number: string; solutionText: string }[] {
  const solutions: { number: string; solutionText: string }[] = [];
  let currentNumber: string | null = null;
  let currentLines: string[] = [];

  function finalize() {
    if (currentNumber && currentLines.length > 0) {
      solutions.push({
        number: currentNumber,
        solutionText: currentLines.join('\n').trim(),
      });
    }
    currentNumber = null;
    currentLines = [];
  }

  for (const line of lines) {
    if (/^\d+$/.test(line) && line.length < 5) continue;

    const solMatch = line.match(/^(?:(?:Q\.?\s*)?(?:Sol(?:ution)?\.?\s*|Ans(?:wer)?\.?\s*))?(\d{1,3})[\.\)\s:]\s*(.*)$/);
    if (solMatch && solMatch[1]) {
      finalize();
      currentNumber = solMatch[1];
      const textAfter = solMatch[2].trim();
      if (textAfter.length > 0) {
        currentLines.push(textAfter);
      }
      continue;
    }

    if (currentNumber && line.length > 0) {
      currentLines.push(line);
    }
  }

  finalize();
  return solutions;
}

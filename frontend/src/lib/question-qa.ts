import katex from 'katex';
import { sanitizeLatex } from '@/components/MathRenderer';

/**
 * Deterministic QA checks for extracted questions — flags broken LaTeX, missing
 * answers, missing/mismatched options, and likely-missing premise data, so a
 * reviewer (or a queue filter) can catch bad extractions before publishing.
 * Pure + free (no LLM): runs in the browser and on the server.
 */

export type QASeverity = 'error' | 'warn';
export interface QAIssue {
    severity: QASeverity;
    code: string;
    message: string;
}

export interface QAQuestion {
    content?: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
    type?: string;
}

const MCQ_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);
const OBJECTIVE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE']);

// "Explanations" that textbooks use as placeholders instead of a real solution.
const PLACEHOLDER_EXPLANATION = /try\s+(it\s+)?yourself|do\s+(it\s+)?yourself|similar to (the above|q\.?\s*no|question|previous)|refer to (the )?(above|previous|q\b)|same as (the )?(above|q\b)|left as an exercise|as in q\.?\s*no/i;

/** Extract $$...$$ and $...$ math blocks from a string. */
function mathBlocks(s: string): string[] {
    if (!s) return [];
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const dd = /\$\$([\s\S]*?)\$\$/g;
    while ((m = dd.exec(s))) out.push(m[1]);
    const noDisplay = s.replace(/\$\$[\s\S]*?\$\$/g, '');
    const sd = /\$([^$\n][\s\S]*?)\$/g;
    while ((m = sd.exec(noDisplay))) out.push(m[1]);
    return out;
}

function latexRenders(block: string): boolean {
    try {
        katex.renderToString(block, { throwOnError: true, strict: false, displayMode: true });
        return true;
    } catch {
        return false;
    }
}

function loosen(s: string): string {
    return s.toLowerCase().replace(/[\s$\\{}]/g, '');
}

/** Analyze one question and return any QA issues (empty = clean). */
export function analyzeQuestion(q: QAQuestion): QAIssue[] {
    const issues: QAIssue[] = [];
    const content = (q.content || '').trim();
    const explanation = (q.explanation || '').trim();
    const options = (q.options || []).map((o) => String(o ?? '').trim()).filter(Boolean);
    const answer = (q.correctAnswer || '').trim();
    const type = (q.type || 'SINGLE_CHOICE').toUpperCase();

    // 1. Empty / stub content
    if (content.length < 5) {
        issues.push({ severity: 'error', code: 'EMPTY_CONTENT', message: 'Question text is empty or too short' });
    }

    // 2. Unbalanced math delimiters (a classic "broken string")
    if (((content + explanation).match(/(?<!\\)\$/g) || []).length % 2 !== 0) {
        issues.push({ severity: 'error', code: 'UNBALANCED_MATH', message: 'Unbalanced $ math delimiters' });
    }

    // 3. LaTeX that won't render (run the SAME sanitize the UI uses, then KaTeX)
    const fields = [content, explanation, ...options];
    const broken = fields.some((f) => mathBlocks(sanitizeLatex(f)).some((b) => !latexRenders(b)));
    if (broken) {
        issues.push({ severity: 'error', code: 'LATEX_RENDER', message: 'Some math will not render (KaTeX error)' });
    }

    // 4. OCR garble
    if (/�/.test(content + explanation + options.join(''))) {
        issues.push({ severity: 'warn', code: 'OCR_GARBLE', message: 'Contains garbled characters (�)' });
    }

    // 5. MCQ with too few options
    if (MCQ_TYPES.has(type) && options.length < 2) {
        issues.push({ severity: 'error', code: 'MISSING_OPTIONS', message: 'Multiple-choice question has fewer than 2 options' });
    }

    // 6. Missing answer on an objective question
    if (OBJECTIVE_TYPES.has(type) && !answer) {
        issues.push({ severity: 'warn', code: 'MISSING_ANSWER', message: 'No answer key set' });
    }

    // 6b. Missing explanation — every question on a teaching platform should
    // ship with a worked solution.
    if (explanation.length < 5) {
        issues.push({ severity: 'warn', code: 'MISSING_EXPLANATION', message: 'No explanation / solution provided' });
    } else if (PLACEHOLDER_EXPLANATION.test(explanation)) {
        // 6c. A placeholder copied verbatim from the book ("Try yourself...",
        // "Similar to Q. No. 3") is not a real solution.
        issues.push({ severity: 'warn', code: 'PLACEHOLDER_EXPLANATION', message: 'Explanation is a placeholder, not a real solution' });
    }

    // 6d. A bare option letter ("A") set as the answer on a question with no
    // options is meaningless — almost always a spurious MCQ letter.
    if (/^[A-Da-d]$/.test(answer) && options.length < 2) {
        issues.push({ severity: 'error', code: 'LETTER_ANSWER_NO_OPTIONS', message: 'Answer is an option letter but the question has no options' });
    }

    // 7. Messed-up answer: a letter answer pointing to an option that doesn't exist
    if (MCQ_TYPES.has(type) && /^[A-Z]$/.test(answer)) {
        const idx = answer.charCodeAt(0) - 65;
        if (idx >= options.length) {
            issues.push({ severity: 'error', code: 'BAD_ANSWER_OPTION', message: `Answer "${answer}" refers to a non-existent option` });
        }
    }

    // 8. Messed-up answer: a text answer that matches none of the options
    if (MCQ_TYPES.has(type) && answer && !/^[A-Z]$/.test(answer) && options.length >= 2) {
        if (!options.some((o) => loosen(o) === loosen(answer))) {
            issues.push({ severity: 'warn', code: 'ANSWER_NOT_IN_OPTIONS', message: 'Answer does not match any option' });
        }
    }

    // 9. Likely-missing premise data (references a matrix/figure/system but has none)
    const refersToData = /given matrix|following matrix|the matrix\b|following system|figure|diagram|graph shown/i;
    const hasData = /\\begin\{(b|p|v|)matrix\}|\\begin\{array\}/.test(content);
    if (refersToData.test(content) && !hasData) {
        issues.push({ severity: 'warn', code: 'MISSING_DATA', message: 'References a matrix/figure/system that is not present' });
    }

    return issues;
}

/** Convenience: highest severity present, or null when clean. */
export function worstSeverity(issues: QAIssue[]): QASeverity | null {
    if (issues.some((i) => i.severity === 'error')) return 'error';
    if (issues.length > 0) return 'warn';
    return null;
}

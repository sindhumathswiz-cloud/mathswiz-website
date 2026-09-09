import prisma from './prisma';
import { fetchFromLLM } from './llm';

interface QuestionCandidate {
    id: string;
    content: string;
    pageNumber: number;
    documentId: string;
}

interface SolutionCandidate {
    content: string;
    pageNumber: number;
    documentId: string;
}

const QUESTION_PATTERNS = [/^\d+[\.\)\s]/, /^Q\.?\s*\d+/, /^Problem\s*\d+/i];
const SOLUTION_PATTERNS = [/^Sol\.?/i, /^Solution/i, /^Ans\.?/i, /^Answer/i, /^\d+[\.\)\s]+(?:Sol|Solution|Ans)/i];

export function isQuestionLine(text: string): boolean {
    return QUESTION_PATTERNS.some(p => p.test(text.trim()));
}

export function isSolutionLine(text: string): boolean {
    return SOLUTION_PATTERNS.some(p => p.test(text.trim()));
}

export async function matchSolutionsForDocument(documentId: string) {
    const pages = await prisma.documentPage.findMany({
        where: { documentId },
        orderBy: { pageNumber: 'asc' }
    });

    const questions: QuestionCandidate[] = [];
    const solutions: SolutionCandidate[] = [];

    for (const page of pages) {
        const lines = (page.rawText || '').split('\n').filter(l => l.trim());
        for (const line of lines) {
            if (isSolutionLine(line)) {
                solutions.push({ content: line, pageNumber: page.pageNumber, documentId });
            } else if (isQuestionLine(line)) {
                questions.push({ id: `q_${page.id}_${line.slice(0, 20)}`, content: line, pageNumber: page.pageNumber, documentId });
            }
        }
    }

    const matches: { questionNumber: string; questionPage: number; solutionPage: number; confidence: number; content: string }[] = [];

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qNum = q.content.match(/^(\d+)/)?.[1];
        if (!qNum) continue;

        const searchWindow = solutions.filter(s =>
            s.pageNumber >= q.pageNumber && s.pageNumber <= q.pageNumber + 3
        );

        let bestMatch: SolutionCandidate | null = null;
        let bestConfidence = 0;

        for (const s of searchWindow) {
            const sNum = s.content.match(/^(\d+)/)?.[1];
            if (sNum === qNum) {
                const distance = s.pageNumber - q.pageNumber;
                const confidence = distance === 0 ? 0.95 : distance === 1 ? 0.85 : distance <= 2 ? 0.7 : 0.5;
                if (confidence > bestConfidence) {
                    bestConfidence = confidence;
                    bestMatch = s;
                }
            }
        }

        if (bestMatch) {
            matches.push({
                questionNumber: qNum,
                questionPage: q.pageNumber,
                solutionPage: bestMatch.pageNumber,
                confidence: bestConfidence,
                content: bestMatch.content
            });
        }
    }

    return matches;
}

/**
 * Match solutions from raw markdown text (used in bulk-import flow).
 * Parses the full markdown, separates solutions section from questions section,
 * and matches by number. Falls back to content-based matching when numbering is ambiguous.
 */
export function matchSolutionsFromMarkdown(
    markdown: string,
    questionNumbers: (string | null)[]
): Map<string, string> {
    const result = new Map<string, string>();
    const lines = markdown.split('\n');

    // Find the solutions section header
    let solSectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^(?:##\s*)?(?:Solutions?|Answer\s*Key)\s*$/i.test(lines[i].trim())) {
            solSectionStart = i + 1;
            break;
        }
    }

    if (solSectionStart < 0) return result;

    // Parse numbered solutions from the solutions section
    const solLines = lines.slice(solSectionStart);
    let currentNum: string | null = null;
    let currentText: string[] = [];

    const flush = () => {
        if (currentNum && currentText.length > 0) {
            result.set(currentNum, currentText.join('\n').trim());
        }
        currentNum = null;
        currentText = [];
    };

    for (const line of solLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match "1. ", "1) ", "Sol 1. ", "Ans 1. "
        const solMatch = trimmed.match(/^(?:(?:Sol(?:ution)?\.?\s*|Ans(?:wer)?\.?\s*|Q\.?\s*))?(\d{1,3})[\.\)\s:]\s*(.*)$/i);
        if (solMatch && solMatch[1]) {
            flush();
            currentNum = solMatch[1];
            if (solMatch[2]) currentText.push(solMatch[2]);
            continue;
        }

        if (currentNum) {
            currentText.push(trimmed);
        }
    }
    flush();

    return result;
}

export async function verifyMatchWithLLM(questionText: string, solutionText: string) {
    try {
        const content = await fetchFromLLM(
            'You verify whether a proposed mathematics solution answers its question. Return only JSON.',
            `Return {"isCorrect": boolean, "confidence": number from 0 to 1, "reason": "brief explanation"}.\n\nQuestion: ${questionText}\n\nSolution: ${solutionText}`,
        );
        const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('LLM verification failed:', e);
    }

    return { isCorrect: false, confidence: 0, reason: 'LLM error' };
}

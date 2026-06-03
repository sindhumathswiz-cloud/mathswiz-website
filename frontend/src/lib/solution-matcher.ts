import prisma from './prisma';

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

export async function verifyMatchWithLLM(questionText: string, solutionText: string) {
    if (!process.env.OPENROUTER_API_KEY) {
        return { isCorrect: false, confidence: 0, reason: 'No API key' };
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [{
                    role: 'user',
                    content: `Verify if this solution correctly answers this question. Return JSON: {"isCorrect": boolean, "confidence": 0-1, "reason": "brief explanation"}\n\nQuestion: ${questionText}\n\nSolution: ${solutionText}`
                }],
                response_format: { type: 'json_object' },
                max_tokens: 200
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
            const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(cleaned);
        }
    } catch (e) {
        console.error('LLM verification failed:', e);
    }

    return { isCorrect: false, confidence: 0, reason: 'LLM error' };
}

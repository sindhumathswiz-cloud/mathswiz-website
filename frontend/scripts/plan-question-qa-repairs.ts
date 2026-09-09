import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { analyzeForAudit } from './audit-question-qa';

config({ path: '.env.local', quiet: true });

type ProposedReview = {
    id: string;
    decision: 'FIXED' | 'NEEDS_HUMAN';
    reason: string;
    content?: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
    confidence?: number;
};

const outputPath = 'qa-repair-plan.json';
// Single-question batches also fit the smaller Groq fallback model.
const batchSize = 1;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function reviewWithCooldown(
    fetchFromLLM: (system: string, user: string, options: { json: boolean; maxTokens: number }) => Promise<string>,
    systemPrompt: string,
    userPrompt: string,
) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            return await fetchFromLLM(systemPrompt, userPrompt, { json: true, maxTokens: 4096 });
        } catch (error) {
            if (attempt === 3 || !String(error).includes('429')) throw error;
            console.log(`qa_plan_cooldown seconds=60 attempt=${attempt + 1}`);
            await sleep(60_000);
        }
    }
    throw new Error('Reviewer cooldown retries exhausted');
}

function parseReviewerResponse(response: string): { reviews: ProposedReview[] } | null {
    const withoutFence = response.replace(/^```json\s*|\s*```$/g, '').trim();
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');
    const candidate = firstBrace >= 0 && lastBrace > firstBrace
        ? withoutFence.slice(firstBrace, lastBrace + 1)
        : withoutFence;
    try {
        const parsed = JSON.parse(candidate);
        return Array.isArray(parsed.reviews) ? parsed : null;
    } catch {
        return null;
    }
}

async function main() {
    // This resumable audit uses Groq only. Other configured providers currently
    // have exhausted quotas and would make every cooldown cycle unnecessarily long.
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY_1;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_1;
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.GEMINI_API_KEY_3;
    const [{ default: prisma }, { fetchFromLLM }] = await Promise.all([
        import('../src/lib/prisma'),
        import('../src/lib/llm'),
    ]);

    const drafts = await prisma.question.findMany({
        where: { status: 'DRAFT' },
        select: {
            id: true,
            content: true,
            options: true,
            correctAnswer: true,
            explanation: true,
            type: true,
            originalRawText: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const flagged = drafts.flatMap((draft) => {
        const normalized = {
            content: draft.content,
            options: Array.isArray(draft.options) ? draft.options.map(String) : [],
            correctAnswer: draft.correctAnswer ?? '',
            explanation: draft.explanation ?? '',
            type: draft.type,
        };
        const issues = analyzeForAudit(normalized);
        return issues.length ? [{ ...draft, ...normalized, issues }] : [];
    });

    const plan: { generatedAt: string; totalFlagged: number; reviews: ProposedReview[] } = existsSync(outputPath)
        ? JSON.parse(readFileSync(outputPath, 'utf8'))
        : { generatedAt: new Date().toISOString(), totalFlagged: flagged.length, reviews: [] };
    const completed = new Set(plan.reviews.map((review) => review.id));
    const remaining = flagged.filter((draft) => !completed.has(draft.id));

    console.log(`qa_plan_start flagged=${flagged.length} completed=${completed.size} remaining=${remaining.length}`);

    for (let offset = 0; offset < remaining.length; offset += batchSize) {
        const batch = remaining.slice(offset, offset + batchSize);
        const payload = batch.map((draft) => ({
            id: draft.id,
            issues: draft.issues,
            type: draft.type,
            content: draft.content,
            options: draft.options,
            correctAnswer: draft.correctAnswer,
            explanation: draft.explanation,
            originalSource: (draft.originalRawText ?? '').slice(0, 1500),
        }));

        const response = await reviewWithCooldown(
            fetchFromLLM,
            `You are a senior mathematics question-bank reviewer. Repair only what can be established from the question, its options, and source text. Independently solve the mathematics before setting an answer or explanation. Never invent a missing diagram, matrix, passage, or premise. Preserve valid LaTeX using balanced $ delimiters. For MCQs, return 2-4 meaningful options and an answer letter A-D. For subjective or integer questions, do not invent MCQ options. Every FIXED item must contain a correct, worked explanation of at least two sentences or a clear derivation. If essential source data is missing or correctness is uncertain, use NEEDS_HUMAN. Return one JSON object with a reviews array, one entry for every supplied id.`,
            JSON.stringify({ questions: payload, responseSchema: {
                reviews: [{ id: 'string', decision: 'FIXED|NEEDS_HUMAN', reason: 'string', content: 'string', options: ['string'], correctAnswer: 'string', explanation: 'string', confidence: '0-100' }],
            } }),
        );

        const parsed = parseReviewerResponse(response);
        if (!parsed) {
            for (const draft of batch) {
                plan.reviews.push({
                    id: draft.id,
                    decision: 'NEEDS_HUMAN',
                    reason: 'Reviewer returned an invalid structured response; no automated change was accepted.',
                });
            }
            plan.generatedAt = new Date().toISOString();
            writeFileSync(outputPath, JSON.stringify(plan, null, 2));
            console.log(`qa_plan_progress reviewed=${plan.reviews.length}/${flagged.length}`);
            continue;
        }

        for (const draft of batch) {
            const candidate = parsed.reviews.find((review: ProposedReview) => review.id === draft.id);
            if (!candidate) {
                plan.reviews.push({ id: draft.id, decision: 'NEEDS_HUMAN', reason: 'Reviewer omitted this question.' });
                continue;
            }
            if (candidate.decision === 'FIXED') {
                const proposed = {
                    content: candidate.content?.trim() || draft.content,
                    options: Array.isArray(candidate.options) ? candidate.options.map(String) : draft.options,
                    correctAnswer: candidate.correctAnswer?.trim() ?? draft.correctAnswer,
                    explanation: candidate.explanation?.trim() ?? draft.explanation,
                    type: draft.type,
                };
                const remainingIssues = analyzeForAudit(proposed);
                if (remainingIssues.length) {
                    plan.reviews.push({
                        ...candidate,
                        decision: 'NEEDS_HUMAN',
                        reason: `Proposed repair still fails QA: ${remainingIssues.join(', ')}`,
                    });
                    continue;
                }
            }
            plan.reviews.push(candidate);
        }

        plan.generatedAt = new Date().toISOString();
        writeFileSync(outputPath, JSON.stringify(plan, null, 2));
        console.log(`qa_plan_progress reviewed=${plan.reviews.length}/${flagged.length}`);
    }

    const fixed = plan.reviews.filter((review) => review.decision === 'FIXED').length;
    const human = plan.reviews.filter((review) => review.decision === 'NEEDS_HUMAN').length;
    console.log(`qa_plan_complete fixed=${fixed} needs_human=${human}`);
    await prisma.$disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

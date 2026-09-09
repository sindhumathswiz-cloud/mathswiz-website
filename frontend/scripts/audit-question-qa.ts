import { config } from 'dotenv';
import katex from 'katex';

config({ path: '.env.local' });

export function analyzeForAudit(question: { content: string; options: string[]; correctAnswer: string; explanation: string; type: string }) {
    const issues: string[] = [];
    const content = question.content.trim();
    const explanation = question.explanation.trim();
    const options = question.options.map((option) => option.trim()).filter(Boolean);
    const answer = question.correctAnswer.trim();
    const type = question.type.toUpperCase();
    const mcq = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
    const objective = mcq || type === 'INTEGER' || type === 'TRUE_FALSE';
    const combined = [content, explanation, ...options].join('\n');

    if (content.length < 5) issues.push('EMPTY_CONTENT');
    if ((combined.match(/(?<!\\)\$/g) ?? []).length % 2 !== 0) issues.push('UNBALANCED_MATH');
    const blocks = [...combined.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n][\s\S]*?)\$/g)]
        .map((match) => match[1] ?? match[2]);
    if (blocks.some((block) => {
        try { katex.renderToString(block, { throwOnError: true, strict: false }); return false; }
        catch { return true; }
    })) issues.push('LATEX_RENDER');
    if (/ï¿½/.test(combined)) issues.push('OCR_GARBLE');
    if (mcq && options.length < 2) issues.push('MISSING_OPTIONS');
    if (objective && !answer) issues.push('MISSING_ANSWER');
    if (explanation.length < 5) issues.push('MISSING_EXPLANATION');
    if (/try\s+(it\s+)?yourself|do\s+(it\s+)?yourself|similar to (the above|q\.?\s*no|question|previous)|refer to (the )?(above|previous|q\b)|same as (the )?(above|q\b)|left as an exercise|as in q\.?\s*no/i.test(explanation)) issues.push('PLACEHOLDER_EXPLANATION');
    if (/^[A-Da-d]$/.test(answer) && options.length < 2) issues.push('LETTER_ANSWER_NO_OPTIONS');
    if (mcq && /^[A-Z]$/.test(answer) && answer.charCodeAt(0) - 65 >= options.length) issues.push('BAD_ANSWER_OPTION');
    if (mcq && answer && !/^[A-Z]$/.test(answer) && options.length >= 2 && !options.some((option) => option.toLowerCase().replace(/[\s$\\{}]/g, '') === answer.toLowerCase().replace(/[\s$\\{}]/g, ''))) issues.push('ANSWER_NOT_IN_OPTIONS');
    if (/given matrix|following matrix|the matrix\b|following system|figure|diagram|graph shown/i.test(content) && !/\\begin\{(b|p|v|)matrix\}|\\begin\{array\}/.test(content)) issues.push('MISSING_DATA');
    return [...new Set(issues)];
}

async function main() {
const { default: prisma } = await import('../src/lib/prisma');

const drafts = await prisma.question.findMany({
    where: { status: 'DRAFT' },
    select: {
        id: true,
        content: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        type: true,
        subject: true,
        class: true,
        examType: true,
        originalRawText: true,
    },
    orderBy: { createdAt: 'asc' },
});

const issueCounts = new Map<string, number>();
const samples = new Map<string, Array<{ id: string; content: string }>>();
let flagged = 0;

for (const draft of drafts) {
    const options = Array.isArray(draft.options) ? draft.options.map(String) : [];
    const issues = analyzeForAudit({
        content: draft.content,
        options,
        correctAnswer: draft.correctAnswer ?? '',
        explanation: draft.explanation ?? '',
        type: draft.type,
    });

    if (issues.length) flagged += 1;
    for (const issue of issues) {
        issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
        const existing = samples.get(issue) ?? [];
        if (existing.length < 3) {
            existing.push({ id: draft.id, content: draft.content.slice(0, 180) });
            samples.set(issue, existing);
        }
    }
}

console.log(JSON.stringify({
    totalDrafts: drafts.length,
    cleanDrafts: drafts.length - flagged,
    flaggedDrafts: flagged,
    issueCounts: Object.fromEntries([...issueCounts.entries()].sort((a, b) => b[1] - a[1])),
    samples: Object.fromEntries(samples),
}, null, 2));

await prisma.$disconnect();
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

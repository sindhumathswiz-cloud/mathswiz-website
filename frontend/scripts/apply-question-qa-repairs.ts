import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { analyzeForAudit } from './audit-question-qa';
import { computeContentHash } from '../src/lib/question-classifier';

config({ path: '.env.local', quiet: true });

type Review = {
    id: string;
    decision: 'FIXED' | 'NEEDS_HUMAN';
    reason: string;
    content?: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
    confidence?: number;
};

const planPath = 'qa-repair-plan.json';
const backupDirectory = 'qa-backups';

async function main() {
    if (!existsSync(planPath)) throw new Error(`Missing ${planPath}`);
    const plan = JSON.parse(readFileSync(planPath, 'utf8')) as { totalFlagged: number; reviews: Review[] };
    if (plan.reviews.length !== plan.totalFlagged) {
        console.log(`qa_apply_partial reviewed=${plan.reviews.length}/${plan.totalFlagged}`);
    }

    const { default: prisma } = await import('../src/lib/prisma');
    const lowConfidence = plan.reviews.filter((review) => review.decision === 'FIXED' && (review.confidence ?? 0) < 80);
    const proposed = plan.reviews.filter((review) => review.decision === 'FIXED' && (review.confidence ?? 0) >= 80);
    if (lowConfidence.length) {
        console.log(`qa_apply_held_low_confidence count=${lowConfidence.length}`);
    }
    const originals = await prisma.question.findMany({
        where: { id: { in: proposed.map((review) => review.id) } },
        select: {
            id: true,
            content: true,
            options: true,
            correctAnswer: true,
            explanation: true,
            contentHash: true,
            type: true,
            status: true,
            reviewNotes: true,
            updatedAt: true,
        },
    });

    mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${backupDirectory}/question-qa-${stamp}.json`;
    writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), questions: originals }, null, 2));
    console.log(`qa_apply_backup path=${backupPath} questions=${originals.length}`);

    const byId = new Map(originals.map((question) => [question.id, question]));
    let approved = 0;
    let held = 0;
    const appliedIds: string[] = [];

    for (const review of proposed) {
        const original = byId.get(review.id);
        if (!original || original.status !== 'DRAFT') {
            held += 1;
            console.log(`qa_apply_held id=${review.id} reason=missing_or_not_draft`);
            continue;
        }

        const repaired = {
            content: review.content?.trim() || original.content,
            options: Array.isArray(review.options)
                ? review.options.map(String)
                : Array.isArray(original.options) ? original.options.map(String) : [],
            correctAnswer: review.correctAnswer?.trim() ?? original.correctAnswer ?? '',
            explanation: review.explanation?.trim() ?? original.explanation ?? '',
        };
        const issues = analyzeForAudit({ ...repaired, type: original.type });
        if (issues.length) {
            held += 1;
            console.log(`qa_apply_held id=${review.id} reason=${issues.join(',')}`);
            continue;
        }

        const hash = computeContentHash(repaired.content);
        const duplicate = await prisma.question.findFirst({
            where: { id: { not: review.id }, status: 'APPROVED', contentHash: hash },
            select: { id: true },
        });
        if (duplicate) {
            held += 1;
            console.log(`qa_apply_held id=${review.id} reason=duplicate_of_${duplicate.id}`);
            continue;
        }

        await prisma.$transaction(async (tx) => {
            await tx.question.update({
                where: { id: review.id },
                data: {
                    ...repaired,
                    contentHash: hash,
                    status: 'APPROVED',
                    confidence: typeof review.confidence === 'number' ? review.confidence : undefined,
                    reviewNotes: `Automated QA repair approved: ${review.reason}`.slice(0, 2000),
                },
            });
            await tx.auditLog.create({
                data: {
                    actorRole: 'SYSTEM',
                    action: 'QUESTION_QA_REPAIRED_AND_APPROVED',
                    entityType: 'Question',
                    entityId: review.id,
                    metadata: {
                        changedFields: ['content', 'options', 'correctAnswer', 'explanation', 'contentHash', 'status', 'confidence', 'reviewNotes'],
                        previousStatus: original.status,
                        newStatus: 'APPROVED',
                        backupPath,
                    },
                },
            });
        });
        approved += 1;
        appliedIds.push(review.id);
        console.log(`qa_apply_progress approved=${approved}/${proposed.length}`);
    }

    const verification = await prisma.question.findMany({
        where: { id: { in: appliedIds }, status: 'APPROVED' },
        select: { id: true, content: true, options: true, correctAnswer: true, explanation: true, type: true },
    });
    const failedVerification = verification.filter((question) => analyzeForAudit({
        content: question.content,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        correctAnswer: question.correctAnswer ?? '',
        explanation: question.explanation ?? '',
        type: question.type,
    }).length > 0);
    if (failedVerification.length) {
        throw new Error(`Post-apply QA failed for: ${failedVerification.map((question) => question.id).join(', ')}`);
    }

    console.log(`qa_apply_complete approved=${approved} held=${held} verified=${verification.length} backup=${backupPath}`);
    await prisma.$disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

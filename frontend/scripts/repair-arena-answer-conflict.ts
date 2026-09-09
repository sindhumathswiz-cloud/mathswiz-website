import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const questionId = 'cms9172ai002p30nyondxmr36';

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const result = await prisma.$transaction(async tx => {
    const current = await tx.question.findUnique({
      where: { id: questionId },
      select: { id: true, content: true, correctAnswer: true, explanation: true, currentVersion: true },
    });
    if (!current) throw new Error('Target question was not found');
    if (current.correctAnswer === 'A') return { changed: false, correctAnswer: 'A' };
    if (current.correctAnswer !== 'C' || !current.explanation?.includes('option A')) {
      throw new Error('Target question changed since review; correction was not applied');
    }

    await tx.question.update({
      where: { id: questionId },
      data: {
        correctAnswer: 'A',
        currentVersion: { increment: 1 },
        reviewNotes: 'Corrected Arena answer-key conflict: derivative is positive for x < 2 or x > 3; option A.',
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'QUESTION_ANSWER_KEY_CORRECTED',
        entityType: 'Question',
        entityId: questionId,
        actorRole: 'SYSTEM',
        metadata: { previousAnswer: 'C', correctedAnswer: 'A', reason: 'Stored key conflicted with verified derivative analysis and detailed solution.' },
      },
    });
    return { changed: true, correctAnswer: 'A' };
  });

  const verified = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true, correctAnswer: true, currentVersion: true, reviewNotes: true } });
  console.log(JSON.stringify({ result, verified }));
  await prisma.$disconnect();
}

main().catch(error => { console.error(error); process.exitCode = 1; });

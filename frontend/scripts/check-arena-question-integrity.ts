import { config } from 'dotenv';
import { extractClaimedAnswerIndex, parseQuestionOptions, resolveCorrectOptionIndex } from '../src/lib/arena-answer';

config({ path: '.env.local', quiet: true });

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const questions = await prisma.question.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, content: true, options: true, correctAnswer: true, explanation: true },
  });
  const conflicts = questions.flatMap(question => {
    const options = parseQuestionOptions(question.options);
    const keyed = resolveCorrectOptionIndex(question.correctAnswer, options);
    const claimed = extractClaimedAnswerIndex(question.explanation);
    if (claimed === null || keyed < 0 || claimed === keyed) return [];
    return [{ ...question, options, keyedOption: String.fromCharCode(65 + keyed), solutionOption: String.fromCharCode(65 + claimed) }];
  });
  const intervalSuspects = questions.flatMap(question => {
    const options = parseQuestionOptions(question.options);
    const joined = options.join(' ');
    return /\\infty|∞/.test(joined) && /(?:2|3)/.test(joined)
      ? [{ ...question, options }]
      : [];
  });
  console.log(JSON.stringify({ reviewed: questions.length, conflicts: conflicts.length, records: conflicts.slice(0, 50), intervalSuspects: intervalSuspects.slice(0, 50) }));
  await prisma.$disconnect();
}

main().catch(error => { console.error(error); process.exitCode = 1; });

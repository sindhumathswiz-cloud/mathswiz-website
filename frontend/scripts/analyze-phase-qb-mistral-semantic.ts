import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), '.private', 'shadow-sample-corrected');
const checkpointPath = path.join(root, 'mistral-semantic-checkpoint.json');
const outputPath = path.join(root, 'mistral-semantic-qa-report.json');
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const drafts = JSON.parse(fs.readFileSync(path.join(root, 'semantic-draft-report.json'), 'utf8'));
const draftById = new Map(
  drafts.pages.flatMap((page: any) => page.questions).map((question: any) => [question.sourceId, question]),
);
const completed = checkpoint.results.filter((result: any) => result.status === 'COMPLETED');
const items = completed.flatMap((result: any) =>
  result.semantic.map((item: any) => ({ pageNumber: result.pageNumber, ...item })),
);
const typeCounts = items.reduce((counts: Record<string, number>, item: any) => {
  counts[item.type] = (counts[item.type] ?? 0) + 1;
  return counts;
}, {});
const answersWithoutEvidence = items.filter((item: any) => item.correctAnswer && !item.answerEvidence);
const evidenceKey = (value: string) => value.toLowerCase().replace(/\\(?:left|right|quad|qquad|displaystyle)/g, '').replace(/[\s$\\{}()[\].,:;*]/g, '');
const untraceableAnswers = items.filter((item: any) => {
  if (!item.correctAnswer) return false;
  const draft: any = draftById.get(item.sourceId);
  const supplied = evidenceKey(`${draft?.correctAnswer ?? ''}\n${draft?.explanation ?? ''}`);
  const claimed = evidenceKey(item.answerEvidence ?? '');
  return !supplied || claimed.length < 2 || !supplied.includes(claimed);
});
const qaItems = items.map((item: any) => ({
  ...item,
  qaStatus: untraceableAnswers.some((unsafe: any) => unsafe.sourceId === item.sourceId) ? 'HOLD_UNTRACEABLE_ANSWER' : 'VALIDATED',
}));
const report = {
  generatedAt: new Date().toISOString(),
  status: checkpoint.status,
  totals: {
    approvedCallCeiling: checkpoint.callCeiling,
    attempts: checkpoint.attempts,
    callsRemaining: checkpoint.callCeiling - checkpoint.attempts,
    completedPages: completed.length,
    failedValidationPages: checkpoint.results.filter((result: any) => result.status === 'FAILED').length,
    providerUnavailablePages: checkpoint.results.filter((result: any) => result.status === 'PROVIDER_UNAVAILABLE').length,
    skippedEmptyPages: checkpoint.results.filter((result: any) => result.status === 'SKIPPED_NO_CANDIDATES').length,
    classifiedQuestions: items.length,
    inputQuestionsClassified: `${items.length}/87`,
    humanReview: items.filter((item: any) => item.needsHumanReview).length,
    answersWithEvidence: items.filter((item: any) => item.correctAnswer && item.answerEvidence).length,
    answersWithoutEvidence: answersWithoutEvidence.length,
    traceableAnswersAccepted: items.filter((item: any) => item.correctAnswer && item.answerEvidence).length - untraceableAnswers.length,
    untraceableAnswersRejected: untraceableAnswers.length,
  },
  typeCounts,
  safetyChecks: {
    everyAnswerHasEvidence: answersWithoutEvidence.length === 0,
    everyAnswerTraceableToSource: untraceableAnswers.length === 0,
    mandatoryFormulaHoldsPreserved: items.filter((item: any) => item.issues.includes('FORMULA_PROVIDER_DISAGREEMENT')).every((item: any) => item.needsHumanReview),
    liveDatabaseWrites: 0,
  },
  completedItems: qaItems,
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, totals: report.totals, typeCounts, safetyChecks: report.safetyChecks }, null, 2));

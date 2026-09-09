import fs from 'node:fs';
import path from 'node:path';
import { assembleOcrPage, type OcrBlock, type ReconciliationDecision } from '../src/lib/book-semantic-assembler';

const root = path.join(process.cwd(), '.private', 'shadow-sample-corrected');
const mistral = JSON.parse(fs.readFileSync(path.join(root, 'mistral-corrected-head-to-head-checkpoint.json'), 'utf8'));
const reconciliation = JSON.parse(fs.readFileSync(path.join(root, 'mathpix-formula-reconciliation-report.json'), 'utf8'));
const decisions = reconciliation.comparisons as ReconciliationDecision[];

const pages = mistral.results
  .filter((result: { status: string }) => result.status === 'COMPLETED')
  .map((result: any) => {
    const sourcePdf = String(result.sourcePdf ?? 'Unknown book');
    const bookName = path.basename(sourcePdf, path.extname(sourcePdf));
    const assembled = assembleOcrPage({
      pageNumber: result.pageNumber,
      bookName,
      blocks: (result.rawOutput?.pages?.[0]?.blocks ?? []) as OcrBlock[],
      reconciliation: decisions.filter((item) => item.pageNumber === result.pageNumber),
    });
    return { pageNumber: result.pageNumber, category: result.category, ...assembled };
  });

const questions = pages.flatMap((page: any) => page.questions);
const orphanBlocks = pages.flatMap((page: any) =>
  page.orphanBlocks.map((block: any) => ({ pageNumber: page.pageNumber, ...block })),
);
const held = questions.filter((question: any) => question.reviewStatus === 'HOLD');
const ready = questions.filter((question: any) => question.reviewStatus === 'READY_FOR_SEMANTIC_REVIEW');

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'OFFLINE_SHADOW_NO_DATABASE_WRITES',
  policy: {
    readyMeaning: 'Structurally assembled only; not approved and not correctness-verified.',
    holdMeaning: 'Must be reconciled before semantic review or import.',
  },
  totals: {
    pages: pages.length,
    questions: questions.length,
    readyForSemanticReview: ready.length,
    held: held.length,
    orphanBlocks: orphanBlocks.length,
    withOptions: questions.filter((question: any) => question.options.length > 0).length,
    withAnswers: questions.filter((question: any) => Boolean(question.correctAnswer)).length,
    withSolutions: questions.filter((question: any) => Boolean(question.explanation)).length,
  },
  pages,
  orphanBlocks,
};

const outputPath = path.join(root, 'semantic-draft-report.json');
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, totals: report.totals }, null, 2));

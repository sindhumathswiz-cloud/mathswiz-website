import fs from 'node:fs';
import path from 'node:path';

type CropResult = {
  key: string;
  pageNumber: number;
  blockIndex: number;
  cropPath: string;
  mistralContent: string;
  status: string;
  rawOutput?: { latex_styled?: string; text?: string };
};

const root = process.cwd();
const checkpointPath = path.join(
  root,
  '.private',
  'shadow-sample-corrected',
  'mathpix-formula-crop-checkpoint.json',
);
const reportPath = path.join(
  root,
  '.private',
  'shadow-sample-corrected',
  'mathpix-formula-reconciliation-report.json',
);

function tokens(value: string): string[] {
  return value
    .replace(/\\begin\{(?:array|aligned)\}(?:\{[^}]*\})?/g, ' ')
    .replace(/\\end\{(?:array|aligned)\}/g, ' ')
    .replace(/\\(?:text|operatorname)\s*\{([^}]*)\}/g, ' $1 ')
    .replace(/\\(?:left|right|quad|qquad|displaystyle|,|;|!)/g, ' ')
    .replace(/\$+/g, ' ')
    .toLowerCase()
    .match(/\\[a-z]+|[a-z]+|\d+|[{}()[\]|^_=+\-*/.,]/g) ?? [];
}

function lcsLength(a: string[], b: string[]): number {
  const row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? diagonal + 1
        : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return row[b.length];
}

function similarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

function tokenDelta(a: string[], b: string[]): { mistralOnly: string[]; mathpixOnly: string[] } {
  const counts = (items: string[]) => {
    const result = new Map<string, number>();
    for (const item of items) result.set(item, (result.get(item) ?? 0) + 1);
    return result;
  };
  const left = counts(a);
  const right = counts(b);
  const expand = (source: Map<string, number>, other: Map<string, number>) =>
    [...source.entries()].flatMap(([token, count]) =>
      Array(Math.max(0, count - (other.get(token) ?? 0))).fill(token),
    );
  return { mistralOnly: expand(left, right), mathpixOnly: expand(right, left) };
}

function exponentAtoms(items: string[]): string[] {
  const atoms: string[] = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    if (items[index] !== '^' && items[index] !== '_') continue;
    let cursor = index + 1;
    while (items[cursor] === '{' || items[cursor] === '(') cursor += 1;
    if (items[cursor]) atoms.push(`${items[index]}${items[cursor]}`);
  }
  return atoms.sort();
}

function criticalSignature(items: string[]) {
  const important = new Set([
    '\\int', '\\sum', '\\prod', '\\pi', '\\alpha', '\\beta', '\\theta',
    '\\infty', '\\sqrt', '\\tan', '\\sin', '\\cos', '=', '+', '-', '|',
  ]);
  return {
    operators: items.filter((item) => important.has(item)).sort(),
    scripts: exponentAtoms(items),
  };
}

const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as {
  attempts: number;
  callCeiling: number;
  results: CropResult[];
};

const completed = checkpoint.results.filter((result) => result.status === 'COMPLETED');
const comparisons = completed.map((result) => {
  const mistralTokens = tokens(result.mistralContent);
  const mathpixText = result.rawOutput?.latex_styled || result.rawOutput?.text || '';
  const mathpixTokens = tokens(mathpixText);
  const score = similarity(mistralTokens, mathpixTokens);
  const delta = tokenDelta(mistralTokens, mathpixTokens);
  const mistralSignature = criticalSignature(mistralTokens);
  const mathpixSignature = criticalSignature(mathpixTokens);
  const criticalDisagreement = JSON.stringify(mistralSignature) !== JSON.stringify(mathpixSignature);
  return {
    key: result.key,
    pageNumber: result.pageNumber,
    blockIndex: result.blockIndex,
    cropPath: result.cropPath,
    similarity: Number(score.toFixed(4)),
    reviewStatus: score < 0.93 || criticalDisagreement ? 'HOLD_FOR_RECONCILIATION' : 'AGREEMENT_PASS',
    criticalDisagreement,
    mistralSignature,
    mathpixSignature,
    mistralOnlyTokens: delta.mistralOnly.slice(0, 30),
    mathpixOnlyTokens: delta.mathpixOnly.slice(0, 30),
    mistralContent: result.mistralContent,
    mathpixLatex: mathpixText,
  };
});

const held = comparisons.filter((item) => item.reviewStatus === 'HOLD_FOR_RECONCILIATION');
const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    comparison: 'LaTeX-aware token LCS plus critical operator/script signatures',
    automaticApprovalThreshold: 0.93,
    note: 'Agreement is a triage signal only; semantic validation remains mandatory.',
  },
  totals: {
    attempts: checkpoint.attempts,
    callCeiling: checkpoint.callCeiling,
    completed: completed.length,
    agreementPass: comparisons.length - held.length,
    heldForReconciliation: held.length,
    meanSimilarity: Number(
      (comparisons.reduce((sum, item) => sum + item.similarity, 0) / comparisons.length).toFixed(4),
    ),
  },
  comparisons,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, totals: report.totals, held: held.map(({ key, similarity }) => ({ key, similarity })) }, null, 2));

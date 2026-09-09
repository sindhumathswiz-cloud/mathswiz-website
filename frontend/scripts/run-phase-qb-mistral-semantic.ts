import { config } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseLLMJson } from '../src/lib/llm-json';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

type Draft = {
  sourceId: string;
  sourceQuestionNumber: string;
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  holdReasons: string[];
};

type PageInput = { pageNumber: number; questions: Draft[]; orphanBlocks: unknown[] };
type SemanticItem = {
  sourceId: string;
  type: string;
  difficulty: string;
  correctAnswer: string;
  answerEvidence: string;
  solutionEvidenceBlockIndices: number[];
  topicTags: string[];
  confidence: number;
  needsHumanReview: boolean;
  issues: string[];
};
type Result = {
  pageNumber: number;
  status: 'COMPLETED' | 'FAILED' | 'PROVIDER_UNAVAILABLE' | 'SKIPPED_NO_CANDIDATES';
  latencyMs?: number;
  model?: string;
  inputQuestionCount: number;
  outputQuestionCount?: number;
  semantic?: SemanticItem[];
  rawOutput?: unknown;
  error?: string;
  completedAt: string;
};
type Checkpoint = {
  version: 1;
  approvedPageCount: 12;
  callCeiling: 12 | 18;
  attempts: number;
  startedAt: string;
  updatedAt: string;
  status: string;
  results: Result[];
  attemptHistory?: Result[];
};

const root = path.join(process.cwd(), '.private', 'shadow-sample-corrected');
const inputPath = path.join(root, 'semantic-draft-report.json');
const checkpointPath = path.join(root, 'mistral-semantic-checkpoint.json');
const model = process.env.QB_MISTRAL_SEMANTIC_MODEL || 'mistral-large-latest';
const allowedTypes = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE', 'ASSERTION_REASONING', 'CASE_STUDY', 'FILL_IN_BLANKS', 'SHORT_ANSWER', 'LONG_ANSWER', 'SUBJECTIVE']);
const allowedDifficulty = new Set(['EASY', 'MEDIUM', 'HARD']);

function capacityError(error: unknown) {
  return /quota|rate.?limit|resource.?exhausted|429|billing|payment|required|subscription tier|model is not available|402|403|503|unavailable|timed? out|aborted/i.test(error instanceof Error ? error.message : String(error));
}

async function save(checkpoint: Checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  await fs.writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

async function loadOrCreate(): Promise<Checkpoint> {
  try {
    return JSON.parse(await fs.readFile(checkpointPath, 'utf8')) as Checkpoint;
  } catch {
    const now = new Date().toISOString();
    return { version: 1, approvedPageCount: 12, callCeiling: 12, attempts: 0, startedAt: now, updatedAt: now, status: 'RUNNING', results: [] };
  }
}

function buildPrompt(page: PageInput) {
  const payload = page.questions.map((question) => ({
    sourceId: question.sourceId,
    sourceQuestionNumber: question.sourceQuestionNumber,
    content: question.content,
    options: question.options,
    sourceCorrectAnswer: question.correctAnswer,
    sourceExplanation: question.explanation,
    existingHoldReasons: question.holdReasons,
  }));
  return `You are a conservative mathematics textbook data curator. Classify and link only the supplied OCR evidence.

Return exactly one JSON object with a "questions" array. Return exactly one result for every supplied sourceId and do not create new sourceIds.

Each result must contain:
- sourceId
- type: SINGLE_CHOICE, MULTIPLE_CHOICE, INTEGER, TRUE_FALSE, ASSERTION_REASONING, CASE_STUDY, FILL_IN_BLANKS, SHORT_ANSWER, LONG_ANSWER, or SUBJECTIVE
- difficulty: EASY, MEDIUM, or HARD
- correctAnswer: copy only an answer explicitly present in sourceCorrectAnswer/sourceExplanation; otherwise "". Never solve or guess.
- answerEvidence: exact short source excerpt supporting correctAnswer, or ""
- solutionEvidenceBlockIndices: [] because block-level evidence is not supplied in this test
- topicTags: 1-3 concise mathematics topics
- confidence: integer 0-100 measuring classification/evidence confidence, not mathematical confidence
- needsHumanReview: true if existingHoldReasons is non-empty, options are incomplete/duplicated, formula text is suspicious, answer evidence is absent for a proposed answer, or question/solution association is uncertain
- issues: concise machine-readable issue names

Never rewrite the question, options, or formula. Never infer the correct option from mathematical reasoning. Existing formula-provider disagreements must remain human-review holds.

PAGE ${page.pageNumber} INPUT:
${JSON.stringify({ questions: payload })}`;
}

function evidenceKey(value: string): string {
  return value.toLowerCase().replace(/\\(?:left|right|quad|qquad|displaystyle)/g, '').replace(/[\s$\\{}()[\].,:;*]/g, '');
}

function validate(raw: unknown, page: PageInput): SemanticItem[] {
  const rawItems = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).questions)
      ? (raw as any).questions
      : null;
  if (!rawItems) throw new Error('Response is missing a questions array');
  const expected = new Set(page.questions.map((question) => question.sourceId));
  const seen = new Set<string>();
  const items = rawItems.map((item: any) => {
    if (!item || typeof item !== 'object' || !expected.has(item.sourceId) || seen.has(item.sourceId)) throw new Error(`Invalid or duplicate sourceId: ${String(item?.sourceId)}`);
    seen.add(item.sourceId);
    if (!allowedTypes.has(item.type)) throw new Error(`Invalid type for ${item.sourceId}`);
    if (!allowedDifficulty.has(item.difficulty)) throw new Error(`Invalid difficulty for ${item.sourceId}`);
    const confidence = Number(item.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error(`Invalid confidence for ${item.sourceId}`);
    return {
      sourceId: item.sourceId,
      type: item.type,
      difficulty: item.difficulty,
      correctAnswer: typeof item.correctAnswer === 'string' ? item.correctAnswer.trim() : '',
      answerEvidence: typeof item.answerEvidence === 'string' ? item.answerEvidence.trim() : '',
      solutionEvidenceBlockIndices: Array.isArray(item.solutionEvidenceBlockIndices) ? item.solutionEvidenceBlockIndices.filter(Number.isInteger) : [],
      topicTags: Array.isArray(item.topicTags) ? item.topicTags.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 3) : [],
      confidence: Math.round(confidence),
      needsHumanReview: Boolean(item.needsHumanReview),
      issues: Array.isArray(item.issues) ? item.issues.map(String).map((value: string) => value.trim()).filter(Boolean) : [],
    } as SemanticItem;
  });
  if (seen.size !== expected.size) throw new Error(`Expected ${expected.size} sourceIds, received ${seen.size}`);
  for (const question of page.questions) {
    const semantic = items.find((item: SemanticItem) => item.sourceId === question.sourceId)!;
    if (question.holdReasons.length > 0 && !semantic.needsHumanReview) throw new Error(`Provider cleared a mandatory hold for ${question.sourceId}`);
    if (semantic.correctAnswer && !semantic.answerEvidence) throw new Error(`Answer lacks evidence for ${question.sourceId}`);
    if (semantic.correctAnswer) {
      const suppliedEvidence = evidenceKey(`${question.correctAnswer}\n${question.explanation}`);
      const claimedEvidence = evidenceKey(semantic.answerEvidence);
      if (!suppliedEvidence || claimedEvidence.length < 2 || !suppliedEvidence.includes(claimedEvidence)) {
        throw new Error(`Answer evidence is not traceable to supplied source text for ${question.sourceId}`);
      }
    }
  }
  return items;
}

async function callMistral(prompt: string) {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Mistral ${response.status}: ${body?.message || body?.detail || response.statusText}`);
    return { body, content: body?.choices?.[0]?.message?.content as string | undefined };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (process.env.QB_MISTRAL_SEMANTIC_TRANSFER_APPROVED !== 'YES') throw new Error('Explicit approval is required for the 12-page text-only semantic test');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8')) as { pages: PageInput[] };
  if (input.pages.length !== 12) throw new Error('Semantic input no longer matches the approved 12-page scope');
  const checkpoint = await loadOrCreate();
  const additionalRetriesApproved = process.env.QB_MISTRAL_SEMANTIC_ADDITIONAL_6_APPROVED === 'YES';
  if (additionalRetriesApproved && checkpoint.callCeiling === 12 && checkpoint.attempts === 12) {
    checkpoint.callCeiling = 18;
    checkpoint.status = 'RUNNING';
    await save(checkpoint);
  }
  if (![12, 18].includes(checkpoint.callCeiling) || checkpoint.approvedPageCount !== 12 || checkpoint.attempts > checkpoint.callCeiling) throw new Error('Semantic checkpoint violates the approved scope');
  if (checkpoint.callCeiling === 18 && !additionalRetriesApproved) throw new Error('The additional six-call approval flag is required to use the extended ceiling');
  for (const result of checkpoint.results) {
    if (result.status === 'FAILED' && result.error && capacityError(result.error)) result.status = 'PROVIDER_UNAVAILABLE';
  }
  const resumeAfterVerifiedAccess = process.env.QB_MISTRAL_SEMANTIC_RESUME_AFTER_ACCESS_VERIFIED === 'YES';
  if (checkpoint.results.some((result) => result.status === 'PROVIDER_UNAVAILABLE') && !resumeAfterVerifiedAccess && checkpoint.attempts < checkpoint.callCeiling) {
    checkpoint.status = 'PAUSED_PROVIDER_UNAVAILABLE';
    await save(checkpoint);
    console.log(JSON.stringify({ status: checkpoint.status, attempts: checkpoint.attempts, remaining: checkpoint.callCeiling - checkpoint.attempts, completed: checkpoint.results.filter((item) => item.status === 'COMPLETED').length }));
    return;
  }
  const existing = new Map(checkpoint.results.map((result) => [result.pageNumber, result]));
  if (resumeAfterVerifiedAccess && checkpoint.attempts < checkpoint.callCeiling) {
    const remaining = checkpoint.callCeiling - checkpoint.attempts;
    const priority = [151, 38, 109, 74, 153, 17, 119, 30];
    const retryPages = priority
      .filter((pageNumber) => existing.get(pageNumber)?.status === 'PROVIDER_UNAVAILABLE')
      .slice(0, remaining);
    checkpoint.attemptHistory ??= [];
    for (const pageNumber of retryPages) {
      checkpoint.attemptHistory.push(existing.get(pageNumber)!);
      existing.delete(pageNumber);
    }
    checkpoint.results = [...existing.values()];
    checkpoint.status = 'RUNNING';
    await save(checkpoint);
  }

  for (const page of input.pages) {
    if (existing.has(page.pageNumber)) continue;
    if (page.questions.length === 0) {
      existing.set(page.pageNumber, { pageNumber: page.pageNumber, status: 'SKIPPED_NO_CANDIDATES', inputQuestionCount: 0, completedAt: new Date().toISOString() });
      checkpoint.results = [...existing.values()];
      await save(checkpoint);
      continue;
    }
    if (checkpoint.attempts >= checkpoint.callCeiling) break;
    checkpoint.attempts += 1;
    await save(checkpoint);
    const startedAt = Date.now();
    let response: Awaited<ReturnType<typeof callMistral>> | undefined;
    try {
      response = await callMistral(buildPrompt(page));
      const semantic = validate(parseLLMJson(response.content), page);
      existing.set(page.pageNumber, { pageNumber: page.pageNumber, status: 'COMPLETED', latencyMs: Date.now() - startedAt, model, inputQuestionCount: page.questions.length, outputQuestionCount: semantic.length, semantic, rawOutput: response.body, completedAt: new Date().toISOString() });
    } catch (error) {
      const status = capacityError(error) ? 'PROVIDER_UNAVAILABLE' : 'FAILED';
      existing.set(page.pageNumber, { pageNumber: page.pageNumber, status, latencyMs: Date.now() - startedAt, inputQuestionCount: page.questions.length, rawOutput: response?.body, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() });
      checkpoint.results = [...existing.values()];
      checkpoint.status = status === 'PROVIDER_UNAVAILABLE' ? 'PAUSED_PROVIDER_UNAVAILABLE' : 'RUNNING';
      await save(checkpoint);
      if (status === 'PROVIDER_UNAVAILABLE') return;
      continue;
    }
    checkpoint.results = [...existing.values()];
    await save(checkpoint);
    console.log(JSON.stringify({ pageNumber: page.pageNumber, completed: checkpoint.results.filter((item) => item.status === 'COMPLETED').length, attempts: checkpoint.attempts }));
  }
  checkpoint.results = [...existing.values()];
  checkpoint.status = checkpoint.attempts >= checkpoint.callCeiling
    ? 'CALL_CEILING_REACHED_PENDING_QA'
    : checkpoint.results.some((item) => item.status === 'PROVIDER_UNAVAILABLE')
      ? 'PAUSED_PROVIDER_UNAVAILABLE'
      : checkpoint.results.length === 12
      ? 'COMPLETED_PENDING_QA'
      : 'CALL_CEILING_REACHED';
  await save(checkpoint);
  console.log(JSON.stringify({ status: checkpoint.status, attempts: checkpoint.attempts, completed: checkpoint.results.filter((item) => item.status === 'COMPLETED').length, skipped: checkpoint.results.filter((item) => item.status === 'SKIPPED_NO_CANDIDATES').length, failedOrHeld: checkpoint.results.filter((item) => !['COMPLETED', 'SKIPPED_NO_CANDIDATES'].includes(item.status)).length }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

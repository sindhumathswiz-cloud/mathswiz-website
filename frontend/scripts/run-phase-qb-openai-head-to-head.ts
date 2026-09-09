import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { benchmarkOpenAiVision } from '../src/lib/book-vision-benchmark';

type Sample = { pageNumber: number; category: string; nativeQuestionMarkers: number; benchmarkImagePath: string; benchmarkImageSha256: string };
type ManifestBook = { id: string; profile: string; samples: Sample[] };
type Result = { key: string; bookId: string; profile: string; pageNumber: number; category: string; nativeQuestionMarkers: number; imagePath: string; imageSha256: string; provider: 'OPENAI_VISION'; status: string; latencyMs?: number; model?: string; metrics?: Record<string, unknown>; rawOutput?: unknown; structuredData?: unknown; error?: string; completedAt?: string };
type Checkpoint = { version: number; approvedPageCount: 12; callCeiling: 12; attempts: number; startedAt: string; updatedAt: string; status: string; approvedSamples: Array<Omit<Result, 'provider' | 'status'>>; results: Result[] };

const root = path.join(process.cwd(), '.private', 'shadow-sample');
const shadowManifestPath = path.join(root, 'shadow-manifest.json');
const geminiCheckpointPath = path.join(root, 'shadow-checkpoint.json');
const checkpointPath = path.join(root, 'openai-head-to-head-checkpoint.json');
process.env.QB_PRIVATE_STORAGE_ROOT = process.cwd();

function isCapacityError(error: unknown) {
  return /(?:quota|rate.?limit|resource.?exhausted|429|billing|503|high demand|timed? out|request aborted|connection error)/i.test(error instanceof Error ? error.message : String(error));
}

async function save(checkpoint: Checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

async function loadOrCreate(): Promise<Checkpoint> {
  try {
    return JSON.parse(await readFile(checkpointPath, 'utf8')) as Checkpoint;
  } catch {
    const manifest = JSON.parse(await readFile(shadowManifestPath, 'utf8')) as { books: ManifestBook[] };
    const gemini = JSON.parse(await readFile(geminiCheckpointPath, 'utf8')) as { results: Array<{ key: string; provider: string; status: string; imageSha256: string }> };
    const completed = new Map(gemini.results.filter(result => result.provider === 'GEMINI_VISION' && result.status === 'COMPLETED').map(result => [result.key, result]));
    const approvedSamples = manifest.books.flatMap(book => book.samples.map(sample => ({
      key: `${book.id}:${sample.pageNumber}:OPENAI_VISION`, bookId: book.id, profile: book.profile,
      pageNumber: sample.pageNumber, category: sample.category, nativeQuestionMarkers: sample.nativeQuestionMarkers,
      imagePath: sample.benchmarkImagePath, imageSha256: sample.benchmarkImageSha256,
      geminiKey: `${book.id}:${sample.pageNumber}:GEMINI_VISION`,
    }))).filter(sample => completed.get(sample.geminiKey)?.imageSha256 === sample.imageSha256).slice(0, 12).map(({ geminiKey: _geminiKey, ...sample }) => sample);
    if (approvedSamples.length !== 12) throw new Error(`Expected exactly 12 Gemini-completed pages, found ${approvedSamples.length}`);
    const now = new Date().toISOString();
    const checkpoint: Checkpoint = { version: 1, approvedPageCount: 12, callCeiling: 12, attempts: 0, startedAt: now, updatedAt: now, status: 'RUNNING', approvedSamples, results: [] };
    await save(checkpoint);
    return checkpoint;
  }
}

async function main() {
  if (process.env.QB_OPENAI_SHADOW_TRANSFER_APPROVED !== 'YES') throw new Error('Explicit approval is required for the 12-page OpenAI shadow comparison');
  const checkpoint = await loadOrCreate();
  if (checkpoint.approvedPageCount !== 12 || checkpoint.callCeiling !== 12 || checkpoint.attempts > 12 || checkpoint.approvedSamples.length !== 12) throw new Error('OpenAI benchmark checkpoint violates the approved scope');
  const existing = new Map(checkpoint.results.map(result => [result.key, result]));

  for (const sample of checkpoint.approvedSamples) {
    if (existing.has(sample.key)) continue;
    if (checkpoint.attempts >= checkpoint.callCeiling) break;
    checkpoint.attempts += 1;
    await save(checkpoint);
    const startedAt = Date.now();
    try {
      const output = await benchmarkOpenAiVision(sample.imagePath);
      existing.set(sample.key, { ...sample, provider: 'OPENAI_VISION', status: 'COMPLETED', latencyMs: Date.now() - startedAt, model: output.model, metrics: output.metrics as Record<string, unknown>, rawOutput: output.rawOutput, structuredData: output.structuredData, completedAt: new Date().toISOString() });
    } catch (error) {
      const status = isCapacityError(error) ? 'PROVIDER_UNAVAILABLE' : 'FAILED';
      existing.set(sample.key, { ...sample, provider: 'OPENAI_VISION', status, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() });
      checkpoint.results = [...existing.values()];
      checkpoint.status = status === 'PROVIDER_UNAVAILABLE' ? 'PAUSED_PROVIDER_UNAVAILABLE' : 'RUNNING';
      await save(checkpoint);
      if (status === 'PROVIDER_UNAVAILABLE') return console.log(JSON.stringify({ status: checkpoint.status, attempts: checkpoint.attempts, completed: checkpoint.results.filter(result => result.status === 'COMPLETED').length }));
      continue;
    }
    checkpoint.results = [...existing.values()];
    await save(checkpoint);
    console.log(JSON.stringify({ provider: 'OPENAI_VISION', pageNumber: sample.pageNumber, completed: checkpoint.results.filter(result => result.status === 'COMPLETED').length, total: 12 }));
  }

  checkpoint.results = [...existing.values()];
  checkpoint.status = checkpoint.results.length === 12 ? 'COMPLETED_PENDING_QA' : 'CALL_CEILING_REACHED';
  await save(checkpoint);
  console.log(JSON.stringify({ status: checkpoint.status, attempts: checkpoint.attempts, completed: checkpoint.results.filter(result => result.status === 'COMPLETED').length, held: checkpoint.results.filter(result => result.status !== 'COMPLETED').length }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

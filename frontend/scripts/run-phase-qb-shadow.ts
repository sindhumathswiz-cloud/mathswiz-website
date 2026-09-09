import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { benchmarkGeminiVision, benchmarkMathpixOcr } from '../src/lib/book-vision-benchmark';

type Sample = { pageNumber: number; category: string; nativeQuestionMarkers: number; benchmarkImagePath: string; benchmarkImageSha256: string };
type ManifestBook = { id: string; profile: string; samples: Sample[] };
type Result = { key: string; bookId: string; profile: string; pageNumber: number; category: string; imageSha256: string; provider: string; status: string; latencyMs?: number; model?: string; metrics?: Record<string, unknown>; rawOutput?: unknown; structuredData?: unknown; error?: string; completedAt?: string };
type Checkpoint = { version: number; startedAt: string; updatedAt: string; status: string; geminiCallCeiling: number; mathpixCallCeiling: number; geminiAttempts?: number; mathpixAttempts?: number; legacyUntrackedGeminiAttempts?: number; results: Result[] };

const root = path.join(process.cwd(), '.private', 'shadow-sample');
const manifestPath = path.join(root, 'shadow-manifest.json');
const checkpointPath = path.join(root, 'shadow-checkpoint.json');
process.env.QB_PRIVATE_STORAGE_ROOT = process.cwd();

function isCapacityError(error: unknown) {
  return /(?:quota|rate.?limit|resource.?exhausted|429|billing|503|high demand|timed? out|request aborted)/i.test(error instanceof Error ? error.message : String(error));
}

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    return JSON.parse(await readFile(checkpointPath, 'utf8')) as Checkpoint;
  } catch {
    const now = new Date().toISOString();
    return { version: 1, startedAt: now, updatedAt: now, status: 'RUNNING', geminiCallCeiling: 100, mathpixCallCeiling: 25, results: [] };
  }
}

async function saveCheckpoint(checkpoint: Checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

function resultKey(bookId: string, pageNumber: number, provider: string) {
  return `${bookId}:${pageNumber}:${provider}`;
}

function mathpixPriority(result: Result, sample: Sample) {
  if (result.status !== 'COMPLETED') return 1000;
  const metrics = result.metrics || {};
  const detected = Number(metrics.detectedQuestions) || 0;
  const unresolved = Number(metrics.unresolvedItems) || 0;
  const confidence = Number(metrics.meanConfidence) || 0;
  const markerMismatch = sample.nativeQuestionMarkers > 0 ? Math.abs(detected - sample.nativeQuestionMarkers) : 0;
  return unresolved * 20 + markerMismatch * 10 + (confidence < 0.9 ? 15 : 0) + (detected === 0 ? 5 : 0);
}

async function main() {
  if (process.env.QB_SHADOW_EXTERNAL_TRANSFER_APPROVED !== 'YES') throw new Error('Set QB_SHADOW_EXTERNAL_TRANSFER_APPROVED=YES only after explicit approval for the 100-page external shadow run');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { samplePages: number; geminiCallCeiling: number; mathpixCallCeiling: number; books: ManifestBook[] };
  if (manifest.samplePages !== 100 || manifest.geminiCallCeiling !== 100 || manifest.mathpixCallCeiling !== 25) throw new Error('Shadow manifest does not match the approved safety ceilings');
  const checkpoint = await loadCheckpoint();
  // The original runner made one retired-model request and one request that had
  // to be interrupted in addition to the persisted result rows.
  checkpoint.legacyUntrackedGeminiAttempts ??= 2;
  checkpoint.geminiAttempts ??= checkpoint.results.filter(result => result.provider === 'GEMINI_VISION').length + checkpoint.legacyUntrackedGeminiAttempts;
  checkpoint.mathpixAttempts ??= checkpoint.results.filter(result => result.provider === 'MATHPIX_OCR').length;
  if (checkpoint.results.filter(result => result.provider === 'GEMINI_VISION').length > 100 || checkpoint.results.filter(result => result.provider === 'MATHPIX_OCR').length > 25) throw new Error('Checkpoint exceeds the approved provider-call ceilings');
  const existing = new Map(checkpoint.results.map(result => [result.key, result]));
  const samples = manifest.books.flatMap(book => book.samples.map(sample => ({ book, sample })));

  // If the process was interrupted after reserving an attempt but before saving
  // its result, hold that page instead of silently resending it on restart.
  const persistedGeminiRows = checkpoint.results.filter(result => result.provider === 'GEMINI_VISION').length;
  const interruptedAttempts = checkpoint.geminiAttempts - persistedGeminiRows - checkpoint.legacyUntrackedGeminiAttempts;
  for (let index = 0; index < interruptedAttempts; index += 1) {
    const missing = samples.find(({ book, sample }) => !existing.has(resultKey(book.id, sample.pageNumber, 'GEMINI_VISION')));
    if (!missing) break;
    const key = resultKey(missing.book.id, missing.sample.pageNumber, 'GEMINI_VISION');
    existing.set(key, { key, bookId: missing.book.id, profile: missing.book.profile, pageNumber: missing.sample.pageNumber, category: missing.sample.category, imageSha256: missing.sample.benchmarkImageSha256, provider: 'GEMINI_VISION', status: 'INTERRUPTED_HELD', error: 'Attempt was interrupted after reservation; not automatically resent.', completedAt: new Date().toISOString() });
  }
  checkpoint.results = [...existing.values()];
  await saveCheckpoint(checkpoint);
  if (process.env.QB_SHADOW_RECONCILE_ONLY === 'YES') {
    checkpoint.status = 'PAUSED_PROVIDER_UNAVAILABLE';
    await saveCheckpoint(checkpoint);
    return console.log(JSON.stringify({ status: checkpoint.status, checkpointPath, geminiAttempts: checkpoint.geminiAttempts, persistedGeminiRows: checkpoint.results.filter(result => result.provider === 'GEMINI_VISION').length }));
  }

  for (const { book, sample } of samples) {
    const key = resultKey(book.id, sample.pageNumber, 'GEMINI_VISION');
    if (existing.get(key)?.imageSha256 === sample.benchmarkImageSha256) continue;
    if (checkpoint.geminiAttempts >= checkpoint.geminiCallCeiling) {
      checkpoint.status = 'PAUSED_CALL_CEILING_REACHED';
      await saveCheckpoint(checkpoint);
      return console.log(JSON.stringify({ status: checkpoint.status, checkpointPath, geminiAttempts: checkpoint.geminiAttempts }));
    }
    checkpoint.geminiAttempts += 1;
    await saveCheckpoint(checkpoint);
    const startedAt = Date.now();
    try {
      const output = await benchmarkGeminiVision(sample.benchmarkImagePath);
      const result: Result = { key, bookId: book.id, profile: book.profile, pageNumber: sample.pageNumber, category: sample.category, imageSha256: sample.benchmarkImageSha256, provider: 'GEMINI_VISION', status: 'COMPLETED', latencyMs: Date.now() - startedAt, model: output.model, metrics: output.metrics as Record<string, unknown>, rawOutput: output.rawOutput, structuredData: output.structuredData, completedAt: new Date().toISOString() };
      existing.set(key, result);
    } catch (error) {
      const result: Result = { key, bookId: book.id, profile: book.profile, pageNumber: sample.pageNumber, category: sample.category, imageSha256: sample.benchmarkImageSha256, provider: 'GEMINI_VISION', status: isCapacityError(error) ? 'PROVIDER_UNAVAILABLE' : 'FAILED', latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() };
      existing.set(key, result);
      checkpoint.results = [...existing.values()];
      checkpoint.status = result.status === 'PROVIDER_UNAVAILABLE' ? 'PAUSED_PROVIDER_UNAVAILABLE' : 'RUNNING';
      await saveCheckpoint(checkpoint);
      if (result.status === 'PROVIDER_UNAVAILABLE') return console.log(JSON.stringify({ status: checkpoint.status, checkpointPath, completedGemini: checkpoint.results.filter(item => item.provider === 'GEMINI_VISION' && item.status === 'COMPLETED').length }));
      continue;
    }
    checkpoint.results = [...existing.values()];
    await saveCheckpoint(checkpoint);
    console.log(JSON.stringify({ provider: 'GEMINI_VISION', bookId: book.id, pageNumber: sample.pageNumber, completed: checkpoint.results.filter(item => item.provider === 'GEMINI_VISION' && item.status === 'COMPLETED').length, total: 100 }));
  }

  const candidates = samples.map(({ book, sample }) => ({ book, sample, gemini: existing.get(resultKey(book.id, sample.pageNumber, 'GEMINI_VISION'))! })).sort((a, b) => mathpixPriority(b.gemini, b.sample) - mathpixPriority(a.gemini, a.sample)).slice(0, 25);
  for (const { book, sample } of candidates) {
    const key = resultKey(book.id, sample.pageNumber, 'MATHPIX_OCR');
    if (existing.get(key)?.imageSha256 === sample.benchmarkImageSha256) continue;
    if (checkpoint.mathpixAttempts >= checkpoint.mathpixCallCeiling) {
      checkpoint.status = 'PAUSED_CALL_CEILING_REACHED';
      await saveCheckpoint(checkpoint);
      return console.log(JSON.stringify({ status: checkpoint.status, checkpointPath, mathpixAttempts: checkpoint.mathpixAttempts }));
    }
    checkpoint.mathpixAttempts += 1;
    await saveCheckpoint(checkpoint);
    const startedAt = Date.now();
    try {
      const output = await benchmarkMathpixOcr(sample.benchmarkImagePath);
      existing.set(key, { key, bookId: book.id, profile: book.profile, pageNumber: sample.pageNumber, category: sample.category, imageSha256: sample.benchmarkImageSha256, provider: 'MATHPIX_OCR', status: 'COMPLETED', latencyMs: Date.now() - startedAt, model: output.model, metrics: output.metrics as Record<string, unknown>, rawOutput: output.rawOutput, completedAt: new Date().toISOString() });
    } catch (error) {
      const status = isCapacityError(error) ? 'PROVIDER_UNAVAILABLE' : 'FAILED';
      existing.set(key, { key, bookId: book.id, profile: book.profile, pageNumber: sample.pageNumber, category: sample.category, imageSha256: sample.benchmarkImageSha256, provider: 'MATHPIX_OCR', status, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() });
      if (status === 'PROVIDER_UNAVAILABLE') {
        checkpoint.results = [...existing.values()];
        checkpoint.status = 'PAUSED_PROVIDER_UNAVAILABLE';
        await saveCheckpoint(checkpoint);
        return console.log(JSON.stringify({ status: checkpoint.status, checkpointPath, completedMathpix: checkpoint.results.filter(item => item.provider === 'MATHPIX_OCR' && item.status === 'COMPLETED').length }));
      }
    }
    checkpoint.results = [...existing.values()];
    await saveCheckpoint(checkpoint);
    console.log(JSON.stringify({ provider: 'MATHPIX_OCR', bookId: book.id, pageNumber: sample.pageNumber, completed: checkpoint.results.filter(item => item.provider === 'MATHPIX_OCR' && item.status === 'COMPLETED').length, total: 25 }));
  }
  checkpoint.results = [...existing.values()];
  checkpoint.status = 'COMPLETED_PENDING_QA';
  await saveCheckpoint(checkpoint);
  console.log(JSON.stringify({ status: checkpoint.status, checkpointPath, geminiCompleted: checkpoint.results.filter(item => item.provider === 'GEMINI_VISION' && item.status === 'COMPLETED').length, mathpixCompleted: checkpoint.results.filter(item => item.provider === 'MATHPIX_OCR' && item.status === 'COMPLETED').length }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

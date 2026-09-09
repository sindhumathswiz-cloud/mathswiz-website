import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { benchmarkMathpixOcr } from '../src/lib/book-vision-benchmark';

type Crop = { key: string; pageNumber: number; blockIndex: number; blockType: string; selectionScore: number; sourceImageSha256: string; sourceBbox: [number, number, number, number]; mistralContent: string; cropPath: string; cropSha256: string; cropBytes: number };
type Result = Crop & { provider: 'MATHPIX_OCR'; status: string; latencyMs?: number; model?: string; metrics?: Record<string, unknown>; rawOutput?: unknown; error?: string; completedAt?: string };
type Checkpoint = { version: 1; callCeiling: 25; attempts: number; startedAt: string; updatedAt: string; status: string; approvedCrops: Crop[]; results: Result[] };

const root = path.join(process.cwd(), '.private', 'shadow-sample-corrected');
const manifestPath = path.join(root, 'mathpix-formula-crop-manifest.json');
const checkpointPath = path.join(root, 'mathpix-formula-crop-checkpoint.json');
process.env.QB_PRIVATE_STORAGE_ROOT = process.cwd();

function isCapacityError(error: unknown) {
  return /(?:quota|rate.?limit|resource.?exhausted|429|billing|payment|required|402|503|unavailable|timed? out|aborted|connection error)/i.test(error instanceof Error ? error.message : String(error));
}

async function save(checkpoint: Checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

async function loadOrCreate(): Promise<Checkpoint> {
  try {
    return JSON.parse(await readFile(checkpointPath, 'utf8')) as Checkpoint;
  } catch {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { callCeiling: number; cropCount: number; crops: Crop[] };
    if (manifest.callCeiling !== 25 || manifest.cropCount > 25 || manifest.crops.length !== manifest.cropCount || new Set(manifest.crops.map(crop => crop.cropSha256)).size !== manifest.cropCount) throw new Error('Mathpix crop manifest violates the approved scope');
    const now = new Date().toISOString();
    const checkpoint: Checkpoint = { version: 1, callCeiling: 25, attempts: 0, startedAt: now, updatedAt: now, status: 'RUNNING', approvedCrops: manifest.crops, results: [] };
    await save(checkpoint);
    return checkpoint;
  }
}

async function main() {
  if (process.env.QB_MATHPIX_CORRECTED_CROPS_APPROVED !== 'YES') throw new Error('Explicit approval is required for up to 25 corrected formula crops');
  const checkpoint = await loadOrCreate();
  if (checkpoint.callCeiling !== 25 || checkpoint.attempts > 25 || checkpoint.approvedCrops.length > 25) throw new Error('Mathpix crop checkpoint violates the approved scope');
  const existing = new Map(checkpoint.results.map(result => [result.key, result]));
  for (const crop of checkpoint.approvedCrops) {
    if (existing.has(crop.key)) continue;
    if (checkpoint.attempts >= checkpoint.callCeiling) break;
    checkpoint.attempts += 1;
    await save(checkpoint);
    const startedAt = Date.now();
    try {
      const output = await benchmarkMathpixOcr(crop.cropPath);
      existing.set(crop.key, { ...crop, provider: 'MATHPIX_OCR', status: 'COMPLETED', latencyMs: Date.now() - startedAt, model: output.model, metrics: output.metrics as Record<string, unknown>, rawOutput: output.rawOutput, completedAt: new Date().toISOString() });
    } catch (error) {
      const status = isCapacityError(error) ? 'PROVIDER_UNAVAILABLE' : 'FAILED';
      existing.set(crop.key, { ...crop, provider: 'MATHPIX_OCR', status, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() });
      checkpoint.results = [...existing.values()];
      checkpoint.status = status === 'PROVIDER_UNAVAILABLE' ? 'PAUSED_PROVIDER_UNAVAILABLE' : 'RUNNING';
      await save(checkpoint);
      if (status === 'PROVIDER_UNAVAILABLE') return console.log(JSON.stringify({ status: checkpoint.status, attempts: checkpoint.attempts, completed: checkpoint.results.filter(result => result.status === 'COMPLETED').length }));
      continue;
    }
    checkpoint.results = [...existing.values()];
    await save(checkpoint);
    console.log(JSON.stringify({ provider: 'MATHPIX_OCR_CROP', pageNumber: crop.pageNumber, completed: checkpoint.results.filter(result => result.status === 'COMPLETED').length, total: checkpoint.approvedCrops.length }));
  }
  checkpoint.results = [...existing.values()];
  checkpoint.status = checkpoint.results.length === checkpoint.approvedCrops.length ? 'COMPLETED_PENDING_QA' : 'CALL_CEILING_REACHED';
  await save(checkpoint);
  console.log(JSON.stringify({ status: checkpoint.status, attempts: checkpoint.attempts, completed: checkpoint.results.filter(result => result.status === 'COMPLETED').length, held: checkpoint.results.filter(result => result.status !== 'COMPLETED').length }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

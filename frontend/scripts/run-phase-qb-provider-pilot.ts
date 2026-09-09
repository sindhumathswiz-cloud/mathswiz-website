import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { benchmarkGeminiVision, benchmarkMathpixOcr } from '../src/lib/book-vision-benchmark';

const corpus = [
  { id: 'arihant-digital-math', profile: 'DIGITAL_MATH', pageNumber: 31, expectedVisibleItems: 24, imagePath: path.join(process.cwd(), 'tmp', 'pdfs', 'region-test', 'arihant', 'page-031.jpg') },
  { id: 'grade12-mixed-layout', profile: 'MIXED_LAYOUT_ASSESSMENT', pageNumber: 53, expectedVisibleItems: 1, imagePath: path.join(process.cwd(), 'tmp', 'pdfs', 'grade12-q.png') },
  { id: 'xam-idea-image-book', profile: 'IMAGE_BOOK', pageNumber: 134, expectedVisibleItems: 12, imagePath: path.join(process.cwd(), 'tmp', 'pdfs', 'xam-q.png') },
  { id: 'rd-sharma-photographed', profile: 'PHOTOGRAPHED_BOOK', pageNumber: 46, expectedVisibleItems: 20, imagePath: path.join(process.cwd(), 'tmp', 'pdfs', 'region-test', 'rd', 'page-046-processed.jpg') },
] as const;

const outputDirectory = path.join(process.cwd(), '.private', 'provider-benchmarks');
const outputPath = path.join(outputDirectory, 'phase-qb-provider-pilot.json');
process.env.QB_PRIVATE_STORAGE_ROOT = process.cwd();

function detectedItems(provider: string, metrics: Record<string, unknown>) {
  return Number(provider === 'GEMINI_VISION' ? metrics.detectedQuestions : metrics.detectedQuestionMarkers) || 0;
}

function quotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:quota|rate.?limit|resource.?exhausted|429|billing)/i.test(message);
}

async function main() {
  const results: Array<Record<string, unknown>> = [];
  const available = { GEMINI_VISION: true, MATHPIX_OCR: true };
  const requestedProviders = (process.env.QB_PILOT_PROVIDERS || 'GEMINI_VISION,MATHPIX_OCR').split(',').filter((provider): provider is 'GEMINI_VISION' | 'MATHPIX_OCR' => provider === 'GEMINI_VISION' || provider === 'MATHPIX_OCR');
  for (const sample of corpus) {
    for (const provider of requestedProviders) {
      if (!available[provider]) {
        results.push({ ...sample, imagePath: undefined, provider, status: 'SKIPPED_PROVIDER_UNAVAILABLE' });
        continue;
      }
      const startedAt = Date.now();
      try {
        const result = provider === 'GEMINI_VISION' ? await benchmarkGeminiVision(sample.imagePath) : await benchmarkMathpixOcr(sample.imagePath);
        const metrics = result.metrics as Record<string, unknown>;
        const detected = detectedItems(provider, metrics);
        results.push({
          sampleId: sample.id,
          profile: sample.profile,
          pageNumber: sample.pageNumber,
          expectedVisibleItems: sample.expectedVisibleItems,
          provider,
          status: 'COMPLETED',
          latencyMs: Date.now() - startedAt,
          model: result.model,
          recallProxy: Number(Math.min(1, detected / sample.expectedVisibleItems).toFixed(4)),
          overDetection: Math.max(0, detected - sample.expectedVisibleItems),
          metrics,
          rawOutput: result.rawOutput,
          structuredData: result.structuredData,
        });
      } catch (error) {
        if (quotaError(error)) available[provider] = false;
        results.push({ sampleId: sample.id, profile: sample.profile, pageNumber: sample.pageNumber, expectedVisibleItems: sample.expectedVisibleItems, provider, status: quotaError(error) ? 'PROVIDER_UNAVAILABLE' : 'FAILED', latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  let previousResults: Array<Record<string, unknown>> = [];
  try {
    const previous = JSON.parse(await readFile(outputPath, 'utf8'));
    if (Array.isArray(previous.results)) previousResults = previous.results;
  } catch { /* first run */ }
  const replacementKeys = new Set(results.map(result => `${result.sampleId}:${result.provider}`));
  const mergedResults = [...previousResults.filter(result => !replacementKeys.has(`${result.sampleId}:${result.provider}`)), ...results];
  const report = { promptVersion: 'QB_PAGE_EXTRACTION_V1', generatedAt: new Date().toISOString(), corpusPages: corpus.length, providerCallsAttempted: mergedResults.filter(result => result.status !== 'SKIPPED_PROVIDER_UNAVAILABLE').length, results: mergedResults };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outputPath, providerCallsAttempted: report.providerCallsAttempted, results: results.map(result => ({ sampleId: result.sampleId, provider: result.provider, status: result.status, latencyMs: result.latencyMs, recallProxy: result.recallProxy, overDetection: result.overDetection, metrics: result.metrics, error: result.error })) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

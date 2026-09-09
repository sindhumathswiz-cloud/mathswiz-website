import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { BENCHMARK_PROMPT_VERSION, benchmarkGeminiVision, benchmarkMathpixOcr, type BenchmarkProvider } from '@/lib/book-vision-benchmark';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true } });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  const benchmarks = await prisma.pageExtractionBenchmark.findMany({
    where: { ingestionRunId: runId }, orderBy: [{ documentPage: { pageNumber: 'asc' } }, { provider: 'asc' }],
    select: { id: true, provider: true, model: true, promptVersion: true, status: true, latencyMs: true, metrics: true, errorMessage: true, createdAt: true, updatedAt: true, documentPage: { select: { pageNumber: true } } },
  });
  return NextResponse.json({ benchmarks });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => null);
  const provider = body?.provider as BenchmarkProvider;
  const pageNumber = Number(body?.pageNumber);
  if (!['GEMINI_VISION', 'MATHPIX_OCR'].includes(provider) || !Number.isInteger(pageNumber) || pageNumber < 1) return NextResponse.json({ error: 'A valid provider and pageNumber are required' }, { status: 400 });
  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true, sourceDocumentId: true } });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  const page = await prisma.documentPage.findUnique({ where: { documentId_pageNumber: { documentId: run.sourceDocumentId, pageNumber } }, select: { id: true, pageImagePath: true, processedImagePath: true } });
  const imagePath = page?.processedImagePath || page?.pageImagePath;
  if (!page || !imagePath) return NextResponse.json({ error: 'Render this page before benchmarking it' }, { status: 409 });
  const existing = await prisma.pageExtractionBenchmark.findUnique({ where: { documentPageId_provider_promptVersion: { documentPageId: page.id, provider, promptVersion: BENCHMARK_PROMPT_VERSION } }, select: { id: true, status: true } });
  if (existing?.status === 'COMPLETED' && body?.force !== true) return NextResponse.json({ error: 'This provider benchmark already exists; set force to rerun it', benchmarkId: existing.id }, { status: 409 });

  const benchmark = await prisma.pageExtractionBenchmark.upsert({
    where: { documentPageId_provider_promptVersion: { documentPageId: page.id, provider, promptVersion: BENCHMARK_PROMPT_VERSION } },
    create: { ingestionRunId: runId, documentPageId: page.id, provider, promptVersion: BENCHMARK_PROMPT_VERSION, status: 'RUNNING' },
    update: { status: 'RUNNING', errorMessage: null, latencyMs: null },
  });
  const startedAt = Date.now();
  try {
    const result = provider === 'GEMINI_VISION' ? await benchmarkGeminiVision(imagePath) : await benchmarkMathpixOcr(imagePath);
    const latencyMs = Date.now() - startedAt;
    const completed = await prisma.pageExtractionBenchmark.update({
      where: { id: benchmark.id },
      data: { status: 'COMPLETED', model: result.model, latencyMs, rawOutput: result.rawOutput as Prisma.InputJsonValue, structuredData: result.structuredData as Prisma.InputJsonValue | undefined, metrics: result.metrics as Prisma.InputJsonValue },
      // rawOutput included so an admin can inspect exactly what the OCR
      // provider returned for a page (e.g. to recover a case-study passage
      // that got dropped during LLM structuring) without a separate route.
      select: { id: true, provider: true, model: true, status: true, latencyMs: true, metrics: true, rawOutput: true },
    });
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PAGE_PROVIDER_BENCHMARKED', entityType: 'PageExtractionBenchmark', entityId: completed.id, metadata: { bookId: id, runId, pageNumber, provider, latencyMs }, ...requestAuditContext(request) });
    return NextResponse.json({ benchmark: completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider benchmark failed';
    await prisma.pageExtractionBenchmark.update({ where: { id: benchmark.id }, data: { status: 'FAILED', latencyMs: Date.now() - startedAt, errorMessage: message.slice(0, 4000) } });
    console.error('Provider benchmark failed:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

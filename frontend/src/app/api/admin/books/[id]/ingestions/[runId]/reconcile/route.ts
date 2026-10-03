import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { reconcileBlocks, reconciliationRecord } from '@/lib/page-reconciliation';
import { selectReadings } from '@/lib/page-readings';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_PAGES_PER_CALL = 200;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Provider agreement for a run, decided from readings that already exist.
 * Nothing here calls an OCR/vision provider or asks for a benchmark to be
 * run: a page is compared only when it already has a Mathpix reading
 * (its Mathpix benchmark, or the OCR text the book extraction stored) AND a
 * Gemini benchmark. Pages with just one reading are reported as such.
 *
 *  - GET  coverage of what exists, plus every page with disputed formulas.
 *  - POST {} or {pageNumber} reconciles the pages that are ready.
 *  - POST {pageNumber, action: 'MARK_REVIEWED' | 'REOPEN'} records a human
 *    decision on a page's disputes.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { sourceDocumentId: true, totalPages: true } });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const [pages, benchmarks, reconciled] = await Promise.all([
    prisma.documentPage.findMany({ where: { documentId: run.sourceDocumentId }, select: { id: true, ocrProvider: true } }),
    prisma.pageExtractionBenchmark.findMany({
      where: { ingestionRunId: runId, status: 'COMPLETED', provider: { in: ['GEMINI_VISION', 'MATHPIX_OCR'] } },
      select: { documentPageId: true, provider: true },
    }),
    prisma.documentPage.findMany({
      where: { documentId: run.sourceDocumentId, layoutData: { path: ['reconciliation', 'status'], string_contains: '' } },
      select: { pageNumber: true, layoutData: true },
      orderBy: { pageNumber: 'asc' },
    }),
  ]);

  const mathpixBenchmarked = new Set(benchmarks.filter(item => item.provider === 'MATHPIX_OCR').map(item => item.documentPageId));
  const geminiBenchmarked = new Set(benchmarks.filter(item => item.provider === 'GEMINI_VISION').map(item => item.documentPageId));
  const coverage = { totalPages: run.totalPages ?? pages.length, ready: 0, mathpixOnly: 0, geminiOnly: 0, noReading: 0 };
  for (const page of pages) {
    const hasMathpix = page.ocrProvider === 'MATHPIX_OCR' || mathpixBenchmarked.has(page.id);
    const hasGemini = geminiBenchmarked.has(page.id);
    if (hasMathpix && hasGemini) coverage.ready += 1;
    else if (hasMathpix) coverage.mathpixOnly += 1;
    else if (hasGemini) coverage.geminiOnly += 1;
    else coverage.noReading += 1;
  }

  const summary = { reconciledPages: 0, clean: 0, hasHolds: 0, reviewed: 0, insufficientEvidence: 0, heldBlocks: 0, agreementBlocks: 0 };
  const pagesNeedingAttention: Array<Record<string, unknown>> = [];
  for (const page of reconciled) {
    const record = asObject(asObject(page.layoutData).reconciliation);
    summary.reconciledPages += 1;
    summary.agreementBlocks += Number(record.agreementBlocks || 0);
    const status = String(record.status);
    if (status === 'CLEAN') summary.clean += 1;
    else if (status === 'INSUFFICIENT_EVIDENCE') summary.insufficientEvidence += 1;
    else if (status === 'HAS_HOLDS' || status === 'REVIEWED') {
      if (status === 'HAS_HOLDS') { summary.hasHolds += 1; summary.heldBlocks += Number(record.heldBlocks || 0); } else summary.reviewed += 1;
      pagesNeedingAttention.push({
        pageNumber: page.pageNumber, status, heldBlocks: Number(record.heldBlocks || 0), agreementBlocks: Number(record.agreementBlocks || 0),
        heldPrintedNumbers: Array.isArray(record.heldPrintedNumbers) ? record.heldPrintedNumbers.map(String) : [],
        heldBlockDetails: Array.isArray(record.heldBlockDetails) ? record.heldBlockDetails : [],
        pairing: record.pairing ?? null, resolution: record.resolution ?? null, computedAt: record.computedAt ?? null,
      });
    }
  }
  return NextResponse.json({ coverage, summary, pages: pagesNeedingAttention });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedPage = body?.pageNumber === undefined ? null : Number(body.pageNumber);
  if (requestedPage !== null && (!Number.isInteger(requestedPage) || requestedPage < 1)) {
    return NextResponse.json({ error: 'pageNumber must be a positive integer' }, { status: 400 });
  }

  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true, sourceDocumentId: true, book: { select: { title: true } } } });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  if (body?.action === 'MARK_REVIEWED' || body?.action === 'REOPEN') {
    if (!requestedPage) return NextResponse.json({ error: 'pageNumber is required for this action' }, { status: 400 });
    const page = await prisma.documentPage.findUnique({ where: { documentId_pageNumber: { documentId: run.sourceDocumentId, pageNumber: requestedPage } }, select: { id: true, layoutData: true } });
    const layout = asObject(page?.layoutData);
    const record = asObject(layout.reconciliation);
    const status = record.status;
    if (!page || (body.action === 'MARK_REVIEWED' ? status !== 'HAS_HOLDS' : status !== 'REVIEWED')) {
      return NextResponse.json({ error: body.action === 'MARK_REVIEWED' ? 'Only a page with unresolved disputes can be marked reviewed' : 'Only a reviewed page can be reopened' }, { status: 409 });
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const next = body.action === 'MARK_REVIEWED'
      ? { ...record, status: 'REVIEWED', resolution: { reviewedBy: auth.user.id, reviewedAt: new Date().toISOString(), note: note || null } }
      : { ...record, status: 'HAS_HOLDS', resolution: null };
    await prisma.documentPage.update({ where: { id: page.id }, data: { layoutData: { ...layout, reconciliation: next } as Prisma.InputJsonValue } });
    await recordAuditLog({
      actorId: auth.user.id, actorRole: 'ADMIN', action: body.action === 'MARK_REVIEWED' ? 'BOOK_PAGE_DISPUTES_REVIEWED' : 'BOOK_PAGE_DISPUTES_REOPENED',
      entityType: 'BookIngestionRun', entityId: run.id, metadata: { bookId: id, pageNumber: requestedPage, note: note || null }, ...requestAuditContext(request),
    });
    return NextResponse.json({ pageNumber: requestedPage, status: next.status });
  }

  // Only pages that already carry a completed Gemini benchmark can ever be
  // compared (Mathpix is the other half and is usually already stored).
  const pages = await prisma.documentPage.findMany({
    where: {
      documentId: run.sourceDocumentId,
      ...(requestedPage ? { pageNumber: requestedPage } : {}),
      benchmarks: { some: { provider: 'GEMINI_VISION', status: 'COMPLETED' } },
    },
    select: {
      id: true, pageNumber: true, layoutData: true, ocrProvider: true, rawMarkdown: true,
      benchmarks: { where: { status: 'COMPLETED', provider: { in: ['GEMINI_VISION', 'MATHPIX_OCR'] } }, select: { provider: true, rawOutput: true, structuredData: true } },
    },
    orderBy: { pageNumber: 'asc' },
    take: MAX_PAGES_PER_CALL,
  });

  const results: Array<{ pageNumber: number; status: string; comparedBlocks: number; heldBlocks: number; heldPrintedNumbers: string[] }> = [];
  let skippedSingleReading = 0;
  for (const page of pages) {
    const selection = selectReadings({ benchmarks: page.benchmarks, extraction: { provider: page.ocrProvider, rawMarkdown: page.rawMarkdown } });
    if (selection.coverage !== 'READY') { skippedSingleReading += 1; continue; }

    const outcome = reconcileBlocks({ pageNumber: page.pageNumber, bookName: run.book.title, blocks: selection.mathpix.blocks, candidates: selection.candidates });
    const record: Record<string, unknown> = reconciliationRecord(outcome, { mathpixOrigin: selection.mathpix.origin });
    const layout = asObject(page.layoutData);
    const previous = asObject(layout.reconciliation);
    // A human review stands as long as the providers still dispute the same things.
    if (record.status === 'HAS_HOLDS' && previous.status === 'REVIEWED' && previous.fingerprint === record.fingerprint) {
      record.status = 'REVIEWED';
      record.resolution = previous.resolution ?? null;
    }
    await prisma.documentPage.update({ where: { id: page.id }, data: { layoutData: { ...layout, reconciliation: record } as Prisma.InputJsonValue } });
    results.push({ pageNumber: page.pageNumber, status: String(record.status), comparedBlocks: outcome.comparedBlocks, heldBlocks: outcome.heldBlocks, heldPrintedNumbers: outcome.heldPrintedNumbers });
  }

  if (requestedPage && results.length === 0) {
    return NextResponse.json({
      error: pages.length === 0
        ? 'This page has no Gemini reading yet, so there is nothing to compare its Mathpix text against. No provider was called.'
        : 'This page has only one provider reading. No provider was called.',
    }, { status: 409 });
  }

  const held = results.filter(item => item.status === 'HAS_HOLDS');
  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PAGES_RECONCILED', entityType: 'BookIngestionRun', entityId: run.id,
    metadata: { bookId: id, pages: results.length, pagesWithHolds: held.length, skippedSingleReading, singlePage: requestedPage },
    ...requestAuditContext(request),
  });
  return NextResponse.json({ reconciled: results.length, pagesWithHolds: held.length, skippedSingleReading, results });
}

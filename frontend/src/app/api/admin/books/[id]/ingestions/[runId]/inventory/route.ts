import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { inspectPrivatePdf } from '@/lib/pdf-inventory';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, storagePath: true, sourceDocumentId: true, providerConfig: true },
  });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (!run.storagePath) return NextResponse.json({ error: 'The original PDF has not been stored' }, { status: 409 });

  await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'IN_PROGRESS', stage: 'LAYOUT_ANALYSIS', progress: 4, startedAt: new Date(), errorMessage: null } });
  try {
    const inventory = await inspectPrivatePdf(run.storagePath);
    const existingConfig = run.providerConfig && typeof run.providerConfig === 'object' && !Array.isArray(run.providerConfig) ? run.providerConfig : {};
    await prisma.$transaction([
      prisma.bookIngestionRun.update({
        where: { id: run.id },
        data: {
          status: 'IN_PROGRESS',
          stage: 'BOOK_MAPPING',
          totalPages: inventory.pages,
          progress: 8,
          providerConfig: {
            ...existingConfig,
            sourceProfile: inventory.source_profile,
            inventory: {
              encrypted: inventory.encrypted,
              outlineItems: inventory.outline_items,
              sampleCharacterMedian: inventory.sample_character_median,
              sampleImageMedian: inventory.sample_image_median,
              sampleTextRichPages: inventory.sample_text_rich_pages,
              metadata: inventory.metadata,
              sampledPages: Object.fromEntries(Object.entries(inventory.sample_pages).map(([page, value]) => [page, { characters: value.characters, words: value.words, images: value.images }])),
            },
          },
        },
      }),
      ...(run.sourceDocumentId ? [prisma.sourceDocument.update({ where: { id: run.sourceDocumentId }, data: { totalPages: inventory.pages, status: 'IN_PROGRESS' } })] : []),
    ]);
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PDF_INVENTORIED', entityType: 'BookIngestionRun', entityId: run.id, metadata: { bookId: id, totalPages: inventory.pages, sourceProfile: inventory.source_profile }, ...requestAuditContext(request) });
    return NextResponse.json({ inventory: { totalPages: inventory.pages, sourceProfile: inventory.source_profile, encrypted: inventory.encrypted, sampleCharacterMedian: inventory.sample_character_median, sampleImageMedian: inventory.sample_image_median } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF inventory failed';
    await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorMessage: message.slice(0, 4000) } });
    console.error('PDF inventory failed:', error);
    return NextResponse.json({ error: 'Page inventory failed. Check the local PDF worker configuration.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { activeBookStorageBackend, hasPdfSignature, pdfHash, removePrivateBookPdf, storePrivateBookPdf, validateBookPdf } from '@/lib/book-storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const runs = await prisma.bookIngestionRun.findMany({
    where: { bookId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, fileHash: true, status: true, stage: true, progress: true, totalPages: true, processedPages: true, expectedQuestions: true, extractedQuestions: true, matchedSolutions: true, verifiedQuestions: true, reviewRequired: true, errorMessage: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ runs });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, title: true, className: true, subject: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  try {
    validateBookPdf(file);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid PDF' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasPdfSignature(buffer)) return NextResponse.json({ error: 'The file does not contain a valid PDF signature' }, { status: 400 });
  const hash = pdfHash(buffer);
  const duplicate = await prisma.bookIngestionRun.findUnique({ where: { bookId_fileHash: { bookId: id, fileHash: hash } }, select: { id: true, status: true, stage: true } });
  if (duplicate) return NextResponse.json({ error: 'This exact PDF is already registered for the book', ingestionRun: duplicate }, { status: 409 });

  let storedPath: string | null = null;
  try {
    storedPath = await storePrivateBookPdf(id, hash, buffer);
    const result = await prisma.$transaction(async tx => {
      const sourceDocument = await tx.sourceDocument.create({
        data: { title: `${book.title} - ${file.name}`, sourceType: 'PDF', documentCategory: 'QUESTION_PAPER', filePath: storedPath, bookId: id, fileHash: hash, className: book.className, subject: book.subject, ingestedBy: auth.user.id },
      });
      const ingestionRun = await tx.bookIngestionRun.create({
        data: { bookId: id, userId: auth.user.id, sourceDocumentId: sourceDocument.id, fileName: file.name.slice(0, 255), fileHash: hash, storagePath: storedPath, stage: 'STORED', providerConfig: { storage: activeBookStorageBackend(), bytes: file.size, mimeType: file.type || 'application/pdf' }, progress: 2 },
      });
      return { sourceDocument, ingestionRun };
    });
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PDF_STORED', entityType: 'BookIngestionRun', entityId: result.ingestionRun.id, metadata: { bookId: id, fileName: file.name, fileHash: hash, bytes: file.size }, ...requestAuditContext(request) });
    return NextResponse.json({ ingestionRun: result.ingestionRun }, { status: 201 });
  } catch (error) {
    if (storedPath) await removePrivateBookPdf(storedPath).catch(() => undefined);
    console.error('Book PDF intake failed:', error);
    return NextResponse.json({ error: 'The PDF could not be stored safely' }, { status: 500 });
  }
}

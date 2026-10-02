import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { validateBookPdf } from '@/lib/book-storage';
import { DuplicateBookPdfError, registerBookPdf } from '@/lib/book-ingestion-intake';

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
  try {
    const result = await registerBookPdf({ bookId: id, book, adminId: auth.user.id, fileName: file.name, fileSize: file.size, mimeType: file.type, buffer });
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PDF_STORED', entityType: 'BookIngestionRun', entityId: result.ingestionRun.id, metadata: { bookId: id, fileName: file.name, fileHash: result.fileHash, bytes: file.size }, ...requestAuditContext(request) });
    return NextResponse.json({ ingestionRun: result.ingestionRun }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateBookPdfError) {
      return NextResponse.json({ error: error.message, ingestionRun: error.duplicate }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'The file does not contain a valid PDF signature') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Book PDF intake failed:', error);
    return NextResponse.json({ error: 'The PDF could not be stored safely' }, { status: 500 });
  }
}

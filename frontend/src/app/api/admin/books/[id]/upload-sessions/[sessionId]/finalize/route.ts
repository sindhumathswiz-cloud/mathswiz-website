import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { assembleUploadSession, deleteUploadSessionChunks, validateBookPdf } from '@/lib/book-storage';
import { DuplicateBookPdfError, registerBookPdf } from '@/lib/book-ingestion-intake';

export const runtime = 'nodejs';
// Reassembling up to 250MB from chunks (and, on the Supabase backend,
// downloading each one back) is the slowest step in the whole upload --
// mirrors the generous ceiling the page-inventory step already uses for a
// similarly whole-file-touching operation.
export const maxDuration = 120;

/**
 * Completes a BookUploadSession once every chunk has arrived: reassembles
 * them into the full PDF buffer and runs it through the exact same
 * validate/hash/store/register path the original single-request upload
 * used (see registerBookPdf) -- a chunked upload and a whole-file upload
 * produce an identical BookIngestionRun either way.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id: bookId, sessionId } = await params;

  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, title: true, className: true, subject: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const session = await prisma.bookUploadSession.findFirst({ where: { id: sessionId, bookId, createdById: auth.user.id } });
  if (!session) return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
  if (session.status === 'COMPLETED' && session.ingestionRunId) {
    const ingestionRun = await prisma.bookIngestionRun.findUnique({ where: { id: session.ingestionRunId } });
    if (ingestionRun) return NextResponse.json({ ingestionRun }, { status: 200 });
  }
  if (session.status !== 'IN_PROGRESS') return NextResponse.json({ error: `Session is ${session.status.toLowerCase()}` }, { status: 409 });
  if (session.receivedChunkCount !== session.totalChunks) {
    return NextResponse.json({ error: `Upload incomplete: ${session.receivedChunkCount}/${session.totalChunks} chunks received` }, { status: 400 });
  }

  await prisma.bookUploadSession.update({ where: { id: sessionId }, data: { status: 'FINALIZING' } });

  try {
    const buffer = await assembleUploadSession(bookId, sessionId, session.totalChunks);
    validateBookPdf({ name: session.fileName, type: 'application/pdf', size: buffer.length } as File);

    const result = await registerBookPdf({ bookId, book, adminId: auth.user.id, fileName: session.fileName, fileSize: buffer.length, mimeType: 'application/pdf', buffer });

    await prisma.bookUploadSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED', ingestionRunId: result.ingestionRun.id } });
    await deleteUploadSessionChunks(bookId, sessionId, session.totalChunks);
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PDF_STORED', entityType: 'BookIngestionRun', entityId: result.ingestionRun.id, metadata: { bookId, fileName: session.fileName, fileHash: result.fileHash, bytes: buffer.length, sessionId, chunked: true }, ...requestAuditContext(request) });

    return NextResponse.json({ ingestionRun: result.ingestionRun }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The PDF could not be stored safely';
    await prisma.bookUploadSession.update({ where: { id: sessionId }, data: { status: error instanceof DuplicateBookPdfError ? 'FAILED' : 'IN_PROGRESS', errorMessage: message } }).catch(() => undefined);

    if (error instanceof DuplicateBookPdfError) {
      await deleteUploadSessionChunks(bookId, sessionId, session.totalChunks);
      return NextResponse.json({ error: message, ingestionRun: error.duplicate }, { status: 409 });
    }
    console.error('Book upload session finalize failed:', error);
    // Left IN_PROGRESS (chunks intact) for anything else, so the admin can
    // just retry finalize rather than re-uploading the whole file.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

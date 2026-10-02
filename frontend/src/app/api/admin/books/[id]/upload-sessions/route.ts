import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { MAX_BOOK_PDF_BYTES, deleteUploadSessionChunks } from '@/lib/book-storage';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Each HTTP request for a chunked upload should be small and fast -- this is
// the whole point of chunking large PDFs instead of one giant POST. 4MB
// comfortably clears every platform request-body ceiling this app might run
// behind (Vercel's historical serverless-function limit is far smaller than
// the app's own 250MB PDF cap), while still keeping the chunk count
// reasonable for a 250MB file (~63 chunks).
export const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

// An abandoned session (browser closed mid-upload, admin gave up) left with
// its chunks on disk/in Supabase Storage forever is just wasted storage, not
// a correctness problem -- so it's swept lazily, the same on-demand pattern
// used for mastery decay (see lib/mastery.ts) rather than a cron job this
// codebase has no infrastructure for.
const STALE_SESSION_AGE_MS = 48 * 60 * 60 * 1000;

async function sweepStaleSessions(bookId: string) {
  const cutoff = new Date(Date.now() - STALE_SESSION_AGE_MS);
  const stale = await prisma.bookUploadSession.findMany({
    where: { bookId, status: 'IN_PROGRESS', updatedAt: { lt: cutoff } },
    select: { id: true, totalChunks: true },
  });
  for (const session of stale) {
    await deleteUploadSessionChunks(bookId, session.id, session.totalChunks);
    await prisma.bookUploadSession.update({ where: { id: session.id }, data: { status: 'FAILED', errorMessage: 'Expired (48h with no activity)' } }).catch(() => undefined);
  }
}

/**
 * Starts (or resumes) a chunked book-PDF upload. Resuming is automatic and
 * keyed on (book, admin, file name, file size): if the same admin reselects
 * the same file for the same book while an IN_PROGRESS session already
 * exists for it, that session is returned as-is -- including its current
 * receivedChunkCount -- so the client picks up from there instead of
 * re-sending bytes already stored. There's no stronger identity check
 * (content hash) available yet at this point, since hashing the whole file
 * client-side before every upload attempt would defeat the purpose of
 * chunking it in the first place.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id: bookId } = await params;

  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 255) : '';
  const fileSize = Number(body?.fileSize);
  if (!fileName.toLowerCase().endsWith('.pdf')) return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
  if (!Number.isFinite(fileSize) || fileSize <= 0) return NextResponse.json({ error: 'A valid fileSize is required' }, { status: 400 });
  if (fileSize > MAX_BOOK_PDF_BYTES) return NextResponse.json({ error: 'PDF exceeds the 250 MB pilot limit' }, { status: 400 });

  await sweepStaleSessions(bookId);

  const existing = await prisma.bookUploadSession.findFirst({
    where: { bookId, createdById: auth.user.id, fileName, fileSize, status: 'IN_PROGRESS' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return NextResponse.json({ session: existing, resumed: true });

  const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE_BYTES));
  const session = await prisma.bookUploadSession.create({
    data: { bookId, createdById: auth.user.id, fileName, fileSize, chunkSize: CHUNK_SIZE_BYTES, totalChunks },
  });

  await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_UPLOAD_SESSION_STARTED', entityType: 'BookUploadSession', entityId: session.id, metadata: { bookId, fileName, fileSize, totalChunks }, ...requestAuditContext(request) });

  return NextResponse.json({ session, resumed: false }, { status: 201 });
}

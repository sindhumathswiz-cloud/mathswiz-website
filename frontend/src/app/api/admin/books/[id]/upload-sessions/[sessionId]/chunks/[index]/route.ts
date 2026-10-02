import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { writeUploadChunk } from '@/lib/book-storage';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Accepts one chunk of a BookUploadSession as a raw binary body (not
 * FormData/multipart -- there's only ever one part, and this route is
 * called dozens of times per upload, so skipping multipart framing keeps
 * each request cheap). Strictly sequential: `index` must equal the
 * session's current receivedChunkCount. A retry of the already-stored chunk
 * (index < receivedChunkCount) is accepted idempotently -- the write
 * succeeded but the client never saw the response (connection dropped
 * exactly in that window) -- rather than erroring, since the bytes are
 * already correctly in place either way.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; sessionId: string; index: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id: bookId, sessionId, index: indexParam } = await params;

  const index = Number(indexParam);
  if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 });

  const session = await prisma.bookUploadSession.findFirst({
    where: { id: sessionId, bookId, createdById: auth.user.id },
  });
  if (!session) return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
  if (session.status !== 'IN_PROGRESS') return NextResponse.json({ error: `Session is ${session.status.toLowerCase()}, not accepting chunks` }, { status: 409 });
  if (index >= session.totalChunks) return NextResponse.json({ error: 'Chunk index out of range' }, { status: 400 });

  if (index < session.receivedChunkCount) {
    // Already stored -- treat as a successful retry, not an error.
    return NextResponse.json({ receivedChunkCount: session.receivedChunkCount, bytesReceived: session.bytesReceived, complete: session.receivedChunkCount === session.totalChunks });
  }
  if (index > session.receivedChunkCount) {
    return NextResponse.json({ error: `Out of order: expected chunk ${session.receivedChunkCount}`, receivedChunkCount: session.receivedChunkCount }, { status: 409 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty chunk' }, { status: 400 });

  const isLastChunk = index === session.totalChunks - 1;
  const expectedSize = isLastChunk ? session.fileSize - index * session.chunkSize : session.chunkSize;
  if (bytes.length !== expectedSize) {
    return NextResponse.json({ error: `Chunk ${index} is ${bytes.length} bytes, expected ${expectedSize}` }, { status: 400 });
  }

  await writeUploadChunk(bookId, sessionId, index, bytes);

  const updated = await prisma.bookUploadSession.update({
    where: { id: sessionId },
    data: { receivedChunkCount: { increment: 1 }, bytesReceived: { increment: bytes.length } },
  });

  return NextResponse.json({
    receivedChunkCount: updated.receivedChunkCount,
    bytesReceived: updated.bytesReceived,
    complete: updated.receivedChunkCount === updated.totalChunks,
  });
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { deleteUploadSessionChunks } from '@/lib/book-storage';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id: bookId, sessionId } = await params;
  const session = await prisma.bookUploadSession.findFirst({ where: { id: sessionId, bookId, createdById: auth.user.id } });
  if (!session) return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
  return NextResponse.json({ session });
}

/** Lets the admin give up on a stuck/unwanted upload and free its chunks
 * immediately, instead of waiting for the 48h stale-session sweep. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id: bookId, sessionId } = await params;

  const session = await prisma.bookUploadSession.findFirst({ where: { id: sessionId, bookId, createdById: auth.user.id } });
  if (!session) return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
  if (session.status === 'COMPLETED') return NextResponse.json({ error: 'This session already completed' }, { status: 409 });

  await deleteUploadSessionChunks(bookId, sessionId, session.totalChunks);
  await prisma.bookUploadSession.update({ where: { id: sessionId }, data: { status: 'FAILED', errorMessage: 'Cancelled by admin' } });

  return NextResponse.json({ success: true });
}

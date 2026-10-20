import { NextResponse } from 'next/server';
import path from 'node:path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { assertPrivateImageReference, readPrivateImage } from '@/lib/book-storage';
import { smartbookPageImagePath, studentSmartbookAccess } from '@/lib/smartbook-data';

export const runtime = 'nodejs';
export const maxDuration = 30;

const contentTypeFor = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
};

/** One printed page of a Smartbook, for a Premium student of the book's class, and only pages inside its exercises. */
export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string; pageNumber: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await studentSmartbookAccess(session.user.id);
  if (!access.premium) return NextResponse.json({ error: 'Smartbooks are part of Premium.' }, { status: 403 });

  const { bookId, pageNumber: raw } = await params;
  const pageNumber = Number.parseInt(raw, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });

  const imagePath = await smartbookPageImagePath(bookId, pageNumber, access.className);
  if (!imagePath) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  try {
    const resolved = assertPrivateImageReference(imagePath);
    const bytes = await readPrivateImage(imagePath);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': contentTypeFor(resolved), 'Cache-Control': 'private, max-age=86400' } });
  } catch {
    return NextResponse.json({ error: 'Page image not found' }, { status: 404 });
  }
}

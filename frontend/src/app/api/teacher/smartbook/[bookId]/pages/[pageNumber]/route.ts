import { NextResponse } from 'next/server';
import path from 'node:path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';
import { assertPrivateImageReference, readPrivateImage } from '@/lib/book-storage';
import { teacherPageImagePath } from '@/lib/smartbook-data';

export const runtime = 'nodejs';
export const maxDuration = 30;

const contentTypeFor = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
};

/** One printed page of a book, for a Premium teacher, and only pages inside its exercises or sections. */
export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string; pageNumber: string }> }) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;

  const { bookId, pageNumber: raw } = await params;
  const pageNumber = Number.parseInt(raw, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });

  const imagePath = await teacherPageImagePath(bookId, pageNumber);
  if (!imagePath) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  try {
    const resolved = assertPrivateImageReference(imagePath);
    const bytes = await readPrivateImage(imagePath);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': contentTypeFor(resolved), 'Cache-Control': 'private, max-age=86400' } });
  } catch {
    return NextResponse.json({ error: 'Page image not found' }, { status: 404 });
  }
}

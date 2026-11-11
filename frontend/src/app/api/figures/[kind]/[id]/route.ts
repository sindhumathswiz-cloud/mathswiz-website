import path from 'node:path';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { privateImageReference, readPrivateImage } from '@/lib/book-storage';
import { figureFile } from '@/lib/figure-display';

export const runtime = 'nodejs';

/**
 * One question figure from private storage, for any signed-in user, when lib/figure-display allows its question to
 * be shown (approved; a page crop also reviewed). The admin route beside the book extraction serves the same files
 * to admins only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const auth = await getAuthenticatedUser();
  if ('error' in auth) return auth.error;
  const { kind, id } = await params;
  if (kind !== 'page' && kind !== 'image') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const file = await figureFile(kind, id, { includeUnapproved: auth.user.role === 'ADMIN' });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const resolved = privateImageReference(file.bookId, file.runId, 'question-images', file.fileName);
    const bytes = await readPrivateImage(resolved);
    const ext = path.extname(resolved).toLowerCase();
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

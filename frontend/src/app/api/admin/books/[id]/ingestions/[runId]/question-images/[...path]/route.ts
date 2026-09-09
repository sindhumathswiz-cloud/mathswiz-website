import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { assertPrivatePageImagePath, privateQuestionImageDirectory } from '@/lib/book-storage';

/**
 * Streams one cropped question-diagram image out of private storage. These
 * files never sit under `public/` (same reasoning as the whole-page renders
 * in book-storage.ts — a book PDF and everything derived from it is
 * copyrighted publisher content, not something to serve unauthenticated),
 * so QuestionImage.imageUrl for a book-extraction crop points here rather
 * than at a static asset path; see extract-questions/route.ts for where
 * that URL is built and lib/page-image-crop.ts for where the file itself is
 * produced.
 */

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; runId: string; path: string[] }> },
) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId, path: pathSegments } = await params;

  // {id, runId} being a real, related pair is a separate check from the
  // path validation below (which only proves the resolved path stays inside
  // private storage) — without this, any admin session could fetch crops
  // belonging to a run under a bookId it doesn't actually belong to.
  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true } });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const fileName = pathSegments?.[0];
  if (!fileName || pathSegments.length !== 1) {
    return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
  }

  let resolved: string;
  try {
    resolved = assertPrivatePageImagePath(path.join(privateQuestionImageDirectory(id, runId), fileName));
  } catch {
    return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
  }

  try {
    const bytes = await readFile(resolved);
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentTypeFor(resolved),
        // Private storage, but cacheable within one admin's session — these
        // files are content-addressed by extraction run and never mutated
        // in place after they're cropped.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}

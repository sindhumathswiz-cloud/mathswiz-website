import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { markableTestsFor } from '@/lib/written-review';

export const dynamic = 'force-dynamic';

/**
 * Serves a photo attached to a written answer to the student who took it, to an admin, and to a
 * teacher who is allowed to mark that test. Nobody else, and never publicly.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId || !role) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const image = await prisma.answerImage.findUnique({
    where: { id },
    select: { mimeType: true, bytes: true, userId: true, attempt: { select: { testId: true } } },
  });
  if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let allowed = role === 'ADMIN' || (role === 'STUDENT' && image.userId === userId);
  if (!allowed && role === 'TEACHER' && image.attempt.testId) {
    const markable = await prisma.test.findFirst({ where: { id: image.attempt.testId, ...markableTestsFor(userId) }, select: { id: true } });
    allowed = !!markable;
  }
  // The same answer for "no such photo" and "not yours", so ids cannot be probed.
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      'Content-Type': image.mimeType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

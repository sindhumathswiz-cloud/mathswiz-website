import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Remove a photo the student attached, while the attempt is still in progress. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    const { id, imageId } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    const removed = await prisma.answerImage.deleteMany({
      where: { id: imageId, userId: studentId, attempt: { testId: id, status: 'IN_PROGRESS' } },
    });
    if (removed.count === 0) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    return NextResponse.json({ removed: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

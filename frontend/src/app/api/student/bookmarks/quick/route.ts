import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIST_NAME = 'My Bookmarks';

/**
 * One-click bookmark: finds-or-creates the caller's default list and adds
 * the question to it, so callers (e.g. the Practice Arena "Save" button)
 * don't need to know about list management.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;

    const body = await request.json().catch(() => null);
    const questionId = body?.questionId;
    if (typeof questionId !== 'string' || !questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
    }

    const question = await prisma.question.findFirst({
      where: { id: questionId, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
      select: { id: true },
    });
    if (!question) {
      return NextResponse.json({ error: 'Question not found or unavailable' }, { status: 404 });
    }

    let list = await prisma.bookmarkList.findUnique({
      where: { userId_name: { userId: studentId, name: DEFAULT_LIST_NAME } },
    });
    if (!list) {
      list = await prisma.bookmarkList.create({
        data: { userId: studentId, name: DEFAULT_LIST_NAME },
      });
    }

    const item = await prisma.bookmarkItem.upsert({
      where: { listId_questionId: { listId: list.id, questionId } },
      update: {},
      create: { listId: list.id, questionId },
    });

    return NextResponse.json({ success: true, list, item });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to bookmark question' }, { status: 500 });
  }
}

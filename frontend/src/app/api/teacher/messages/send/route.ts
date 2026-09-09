import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !['TEACHER', 'ADMIN'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const teacherId = (session.user as any).id;
    const { batchId, content, subject, priority } = await req.json();

    if (!batchId || !content) {
      return NextResponse.json({ error: 'Batch ID and content are required' }, { status: 400 });
    }

    const ownedBatch = await prisma.batch.findFirst({
      where: { id: batchId, ...(session.user.role === 'ADMIN' ? {} : { teacherId }) },
      select: { id: true },
    });
    if (!ownedBatch) return NextResponse.json({ error: 'Batch not found or not owned by you' }, { status: 403 });

    // Get all students in the batch
    const enrollments = await (prisma as any).batchEnrollment.findMany({
      where: { batchId, status: 'APPROVED' },
      select: { studentId: true },
    });

    const studentIds = enrollments.map((e: any) => e.studentId);

    if (studentIds.length === 0) {
      return NextResponse.json({ error: 'No students found in this batch' }, { status: 404 });
    }

    // Create message for each student
    const messages = await Promise.all(
      studentIds.map(async (studentId: string) => {
        return (prisma as any).message.create({
          data: {
            senderId: teacherId,
            receiverId: studentId,
            batchId,
            content,
            subject: subject || null,
            priority: priority || 'NORMAL',
            type: 'TEACHER_BROADCAST',
          },
        });
      })
    );

    // Create notifications for each student
    await Promise.all(
      studentIds.map(async (studentId: string) => {
        return (prisma as any).notification.create({
          data: {
            userId: studentId,
            title: 'New Message from Teacher',
            message: subject || 'You have a new message',
            type: 'MESSAGE',
            link: `/student/messages`,
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      sentCount: messages.length,
      messages,
    });
  } catch (error: any) {
    console.error('Error sending batch message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

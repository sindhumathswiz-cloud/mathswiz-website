import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;

    const messages = await (prisma as any).message.findMany({
      where: {
        OR: [
          { receiverId: studentId },
          { senderId: studentId },
        ],
      },
      include: {
        sender: { select: { firstName: true, lastName: true, role: true } },
        receiver: { select: { firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Count unread
    const unreadCount = await (prisma as any).message.count({
      where: { receiverId: studentId, isRead: false },
    });

    return NextResponse.json({
      success: true,
      messages,
      unreadCount,
    });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;
    const { replyToId, content, receiverId } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const teacherAccess = await (prisma as any).batchEnrollment.findFirst({
      where: { studentId, status: 'APPROVED', batch: { teacherId: receiverId } },
      select: { id: true },
    });
    if (!teacherAccess) {
      return NextResponse.json({ error: 'You can only message a teacher for one of your batches' }, { status: 403 });
    }

    if (replyToId) {
      const original = await (prisma as any).message.findFirst({
        where: {
          id: replyToId,
          OR: [
            { senderId: studentId, receiverId },
            { senderId: receiverId, receiverId: studentId },
          ],
        },
        select: { id: true },
      });
      if (!original) return NextResponse.json({ error: 'Message thread not found' }, { status: 403 });
    }

    const message = await (prisma as any).message.create({
      data: {
        senderId: studentId,
        receiverId,
        content,
        type: replyToId ? 'REPLY' : 'STUDENT_MESSAGE',
        replyToId: replyToId || null,
      },
      include: {
        sender: { select: { firstName: true, lastName: true, role: true } },
        receiver: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    // Notify receiver
    if (receiverId) {
      await (prisma as any).notification.create({
        data: {
          userId: receiverId,
          title: 'New Message Reply',
          message: `${(session.user as any).name || 'A student'} replied to your message`,
          type: 'MESSAGE',
          link: `/teacher/messages`,
        },
      });
    }

    // Mark original message as read
    if (replyToId) {
      await (prisma as any).message.updateMany({
        where: { id: replyToId, receiverId: studentId },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error('Error sending message reply:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;
    const { messageId } = await req.json();

    await (prisma as any).message.updateMany({
      where: {
        id: messageId,
        receiverId: studentId,
      },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking message as read:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

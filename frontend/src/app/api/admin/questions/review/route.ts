import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const body = await req.json();
        const { questionId, action, reviewNotes, subject, class: classLevel, topic, subTopic } = body;

        if (!questionId || !action) {
            return NextResponse.json({ error: 'questionId and action required' }, { status: 400 });
        }

        if (!['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ error: 'action must be APPROVE or REJECT' }, { status: 400 });
        }

        const question = await prisma.question.findUnique({
            where: { id: questionId }
        });

        if (!question) {
            return NextResponse.json({ error: 'Question not found' }, { status: 404 });
        }

        if (question.status !== 'PENDING_REVIEW') {
            return NextResponse.json({ error: 'Question is not pending review' }, { status: 400 });
        }

        const updateData: any = {
            reviewNotes: reviewNotes || question.reviewNotes
        };

        if (action === 'APPROVE') {
            updateData.status = 'APPROVED';
            updateData.scope = 'PUBLIC';
            if (subject) updateData.subject = subject;
            if (classLevel) updateData.class = classLevel;
            if (topic) updateData.topic = topic;
            if (subTopic) updateData.subTopic = subTopic;
        } else {
            updateData.status = 'REJECTED';
        }

        const updated = await prisma.question.update({
            where: { id: questionId },
            data: updateData
        });

        return NextResponse.json({ success: true, question: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

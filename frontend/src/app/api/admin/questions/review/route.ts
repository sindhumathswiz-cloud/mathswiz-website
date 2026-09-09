import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

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
            // QuestionStatus has no REJECTED member (DRAFT / PENDING_REVIEW /
            // APPROVED / REPORTED / ARCHIVED only) -- using it here threw
            // "Invalid value for argument `status`. Expected QuestionStatus."
            // on every reject, so this branch has never actually worked.
            // ARCHIVED is the correct "retired, not live, not deleted" state.
            updateData.status = 'ARCHIVED';
        }

        const updated = await prisma.question.update({
            where: { id: questionId },
            data: updateData
        });

        await recordAuditLog({
            actorId: (session.user as any).id,
            actorRole: (session.user as any).role,
            action: action === 'APPROVE' ? 'QUESTION_APPROVED' : 'QUESTION_REJECTED',
            entityType: 'Question',
            entityId: questionId,
            metadata: { status: updateData.status, scope: updateData.scope },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ success: true, question: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

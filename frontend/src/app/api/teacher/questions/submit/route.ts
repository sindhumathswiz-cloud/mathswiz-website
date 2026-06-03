import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'TEACHER') {
            return NextResponse.json({ error: 'Unauthorized - Teacher only' }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const body = await req.json();
        const { questionIds } = body;

        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            return NextResponse.json({ error: 'questionIds array required' }, { status: 400 });
        }

        // Verify all questions belong to this teacher and are in DRAFT state
        const questions = await prisma.question.findMany({
            where: {
                id: { in: questionIds },
                createdById: userId,
                scope: 'TEACHER_PRIVATE',
                status: 'DRAFT'
            }
        });

        if (questions.length !== questionIds.length) {
            return NextResponse.json({ 
                error: 'Some questions not found or not in valid state',
                valid: questions.map(q => q.id)
            }, { status: 400 });
        }

        // Update to PENDING_REVIEW
        const updated = await prisma.$transaction(
            questions.map(q => prisma.question.update({
                where: { id: q.id },
                data: { status: 'PENDING_REVIEW' }
            }))
        );

        return NextResponse.json({ success: true, count: updated.length });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || session.user.role !== 'STUDENT') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await request.json();
        const batchCode = body.batchCode?.trim().toUpperCase();

        if (!batchCode) {
            return NextResponse.json({ error: 'Invalid batch code' }, { status: 400 });
        }

        const batch = await prisma.batch.findUnique({
            where: { code: batchCode },
            select: { id: true, name: true, code: true },
        });
        if (!batch) return NextResponse.json({ error: 'Batch code not found' }, { status: 404 });

        const existing = await prisma.batchEnrollment.findUnique({
            where: { batchId_studentId: { batchId: batch.id, studentId: session.user.id } },
            select: { status: true },
        });
        if (existing) {
            return NextResponse.json({ error: `An enrollment request already exists with status ${existing.status}.` }, { status: 409 });
        }

        const enrollment = await prisma.batchEnrollment.create({
            data: { batchId: batch.id, studentId: session.user.id, status: 'PENDING' },
            select: { id: true, status: true },
        });

        return NextResponse.json({
            message: 'Join request sent. Waiting for Teacher approval.',
            status: enrollment.status,
            enrollmentId: enrollment.id,
            batch: { id: batch.id, batchCode: batch.code, course: { title: batch.name } },
        }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to send join request' }, { status: 500 });
    }
}


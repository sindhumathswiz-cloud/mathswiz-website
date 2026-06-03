import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { batchCode } = body;

        if (!batchCode || batchCode.length < 5) {
            return NextResponse.json({ error: 'Invalid batch code' }, { status: 400 });
        }

        // In a real application, we would create a BatchEnrollment record here via Prisma
        // e.g. await prisma.batchEnrollment.create({ data: { userId, batchId, status: 'PENDING' } })

        return NextResponse.json({
            message: 'Join request sent. Waiting for Teacher approval.',
            status: 'PENDING',
            batch: {
                id: Date.now().toString(),
                batchCode,
                course: { title: 'Mock Course Subscription' }
            }
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to send join request' }, { status: 500 });
    }
}


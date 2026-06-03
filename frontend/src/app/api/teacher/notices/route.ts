import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from '@/lib/prisma';

// GET: fetch all notices for batches belonging to this teacher
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const teacherId = (session?.user as any)?.id;
        if (!teacherId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const notices = await (prisma as any).notice.findMany({
            where: { teacherId },
            include: { batch: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return NextResponse.json(notices);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: create a new notice for a batch
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const teacherId = (session?.user as any)?.id;
        if (!teacherId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { title, content, batchId } = body;

        if (!title?.trim() || !content?.trim() || !batchId) {
            return NextResponse.json({ error: 'title, content, and batchId are required' }, { status: 400 });
        }

        // Verify the batch belongs to this teacher
        const batch = await (prisma as any).batch.findFirst({
            where: { id: batchId, teacherId },
        });
        if (!batch) return NextResponse.json({ error: 'Batch not found or unauthorized' }, { status: 403 });

        const notice = await (prisma as any).notice.create({
            data: { title: title.trim(), content: content.trim(), batchId, teacherId },
            include: { batch: { select: { name: true } } },
        });

        return NextResponse.json(notice, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: remove a notice by id (must belong to this teacher)
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const teacherId = (session?.user as any)?.id;
        if (!teacherId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });

        await (prisma as any).notice.delete({
            where: { id, teacherId },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


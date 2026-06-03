import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const pendingTags = await prisma.tagTaxonomy.findMany({
            where: { isApproved: false },
            orderBy: { createdAt: 'desc' },
            include: {
                parent: {
                    select: { id: true, name: true, type: true }
                }
            }
        });

        return NextResponse.json({ items: pendingTags });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if ((session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Only admin can approve tags" }, { status: 403 });
        }

        const userId = (session.user as any).id;
        const body = await req.json();
        const { tagIds, action } = body;

        if (!Array.isArray(tagIds) || tagIds.length === 0) {
            return NextResponse.json({ error: "tagIds array required" }, { status: 400 });
        }

        if (!['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ error: "action must be APPROVE or REJECT" }, { status: 400 });
        }

        const updateData: any = {
            approvedBy: userId,
            approvedAt: new Date(),
        };

        if (action === 'APPROVE') {
            updateData.isApproved = true;
        }

        const result = await prisma.tagTaxonomy.updateMany({
            where: { id: { in: tagIds }, isApproved: false },
            data: updateData
        });

        return NextResponse.json({ success: true, count: result.count });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
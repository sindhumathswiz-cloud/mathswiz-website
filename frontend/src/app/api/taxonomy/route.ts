import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const parentId = searchParams.get('parentId');
        const boardType = searchParams.get('board');
        const isApproved = searchParams.get('isApproved');

        const where: any = {};
        if (type) where.type = type as any;
        if (parentId === 'null') where.parentId = null;
        else if (parentId) where.parentId = parentId;
        if (boardType) where.boardType = boardType as any;
        if (isApproved !== null) where.isApproved = isApproved === 'true';

        const items = await prisma.tagTaxonomy.findMany({
            where,
            orderBy: [
                { order: 'asc' },
                { name: 'asc' }
            ],
            include: {
                children: {
                    orderBy: { order: 'asc' },
                    select: { id: true, name: true, type: true, order: true }
                },
                _count: {
                    select: { children: true, questionTags: true }
                }
            }
        });

        return NextResponse.json({ items });
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

        const userId = (session.user as any).id;
        const role = (session.user as any).role;

        const body = await req.json();
        const { name, type, parentId, description, order, boardType, sourceUrl } = body;

        if (!name || !type) {
            return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
        }

        const existing = await prisma.tagTaxonomy.findFirst({
            where: { name, type, parentId: parentId || null }
        });

        if (existing) {
            return NextResponse.json({ error: "Tag already exists" }, { status: 400 });
        }

        const data: any = {
            name,
            type,
            parentId: parentId || null,
            order: order || 0,
            isActive: true,
            createdById: userId,
        };

        if (description) data.description = description;
        if (boardType) data.boardType = boardType;
        if (sourceUrl) data.sourceUrl = sourceUrl;

        if (role === 'ADMIN') {
            data.isApproved = true;
            data.isLocked = sourceUrl ? true : false;
            data.approvedBy = userId;
            data.approvedAt = new Date();
            data.source = 'MANUAL';
        } else {
            data.isApproved = false;
            data.isLocked = false;
            data.source = 'MANUAL';
        }

        const created = await prisma.tagTaxonomy.create({ data });

        return NextResponse.json({ success: true, item: created });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
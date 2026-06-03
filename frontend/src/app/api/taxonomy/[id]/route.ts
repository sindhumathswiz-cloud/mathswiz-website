import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        const item = await prisma.tagTaxonomy.findUnique({
            where: { id },
            include: {
                children: {
                    orderBy: { order: 'asc' },
                    include: {
                        children: {
                            orderBy: { order: 'asc' },
                            select: { id: true, name: true, type: true, order: true }
                        }
                    }
                },
                parent: {
                    select: { id: true, name: true, type: true }
                },
                _count: {
                    select: { children: true, questionTags: true }
                }
            }
        });

        if (!item) {
            return NextResponse.json({ error: "Tag not found" }, { status: 404 });
        }

        return NextResponse.json({ item });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const userId = (session.user as any).id;
        const role = (session.user as any).role;

        const existing = await prisma.tagTaxonomy.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "Tag not found" }, { status: 404 });
        }

        if (existing.isLocked && role !== 'ADMIN') {
            return NextResponse.json({ error: "This tag is locked and cannot be modified" }, { status: 403 });
        }

        if (existing.createdById !== userId && role !== 'ADMIN') {
            return NextResponse.json({ error: "You can only modify your own tags" }, { status: 403 });
        }

        const body = await req.json();
        const { name, description, order, isActive } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (order !== undefined) updateData.order = order;
        if (isActive !== undefined) updateData.isActive = isActive;

        if (role === 'ADMIN' && body.approvedBy !== undefined) {
            updateData.approvedBy = body.approvedBy;
            updateData.approvedAt = new Date();
        }

        const updated = await prisma.tagTaxonomy.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({ success: true, item: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const userId = (session.user as any).id;
        const role = (session.user as any).role;

        if (role !== 'ADMIN') {
            return NextResponse.json({ error: "Only admin can delete taxonomy tags" }, { status: 403 });
        }

        const existing = await prisma.tagTaxonomy.findUnique({
            where: { id },
            include: { _count: { select: { children: true, questionTags: true } } }
        });

        if (!existing) {
            return NextResponse.json({ error: "Tag not found" }, { status: 404 });
        }

        if (existing.isLocked) {
            return NextResponse.json({ error: "Official tags cannot be deleted" }, { status: 403 });
        }

        if (existing._count.children > 0) {
            return NextResponse.json({ 
                error: "Cannot delete tag with children. Delete children first." 
            }, { status: 400 });
        }

        if (existing._count.questionTags > 0) {
            return NextResponse.json({ 
                error: "Cannot delete tag with associated questions" 
            }, { status: 400 });
        }

        await prisma.tagTaxonomy.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
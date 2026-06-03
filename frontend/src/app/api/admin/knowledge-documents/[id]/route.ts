import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * SECURED ADMIN KNOWLEDGE DOCUMENT EDITOR
 * Allows Admins to manually correct AI-extracted source text.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 401 });
        }

        const { content, title, isActive } = await req.json();

        const updated = await prisma.knowledgeDocument.update({
            where: { id },
            data: {
                ...(content !== undefined && { content }),
                ...(title !== undefined && { title }),
                ...(isActive !== undefined && { isActive }),
            }
        });

        return NextResponse.json({ success: true, document: updated });
    } catch (err: any) {
        console.error("[ADMIN-DOC-PATCH-API] Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 401 });
        }

        await prisma.knowledgeDocument.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

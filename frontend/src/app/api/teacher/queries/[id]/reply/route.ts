import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { content, imageUrl } = await req.json();
        const { id: queryId } = await context.params;

        if (!content) {
            return NextResponse.json({ error: "Content is required" }, { status: 400 });
        }

        const query = await (prisma as any).teacherQuery.findUnique({
            where: { id: queryId },
        });

        if (!query) {
            return NextResponse.json({ error: "Query not found" }, { status: 404 });
        }

        if (query.teacherId !== session.user.id && query.studentId !== session.user.id) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const reply = await (prisma as any).queryReply.create({
            data: {
                queryId,
                senderId: session.user.id,
                content,
                imageUrl: imageUrl || null,
            },
            include: {
                sender: { select: { firstName: true, lastName: true, role: true, image: true } },
            },
        });

        if (session.user.id === query.teacherId) {
            await (prisma as any).teacherQuery.update({
                where: { id: queryId },
                data: { status: 'RESOLVED' },
            });
        }

        return NextResponse.json({ success: true, reply });
    } catch (error: any) {
        console.error("Reply error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

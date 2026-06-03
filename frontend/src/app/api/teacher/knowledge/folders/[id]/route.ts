import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "@/lib/auth";

import prisma from "@/lib/prisma";

// Get Folder Detail with Documents
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const folderId = (await params).id;
        const dbUser = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
        if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const folder = await prisma.knowledgeFolder.findFirst({
            where: { id: folderId, userId: dbUser.id },
            include: { documents: { orderBy: { createdAt: 'desc' } } }
        });

        if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

        return NextResponse.json({ success: true, folder });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Delete Folder entirely
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const dbUser = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
        if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        await prisma.knowledgeFolder.deleteMany({
            where: { id: (await params).id, userId: dbUser.id }
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// List All Folders
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const dbUser = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
        if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Teachers browse their own folders plus every admin-created folder
        // (the shared training corpus), matching the sharing rule used across
        // the rest of the knowledge base API.
        const folders = await prisma.knowledgeFolder.findMany({
            where: {
                OR: [
                    { userId: dbUser.id },
                    { user: { role: 'ADMIN' } }
                ]
            },
            include: { _count: { select: { documents: true } } },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json({ success: true, folders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Folder creation is admin-only — teachers use the folders admins create.
export async function POST() {
    return NextResponse.json({ error: "Only admins can create knowledge folders." }, { status: 403 });
}

// Rename Folder
export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { folderId, newTopicName } = await req.json();
        if (!folderId || !newTopicName) return NextResponse.json({ error: "Folder ID and new topic name required" }, { status: 400 });

        const dbUser = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
        if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        await prisma.knowledgeFolder.updateMany({
            where: { id: folderId, userId: dbUser.id },
            data: { topicName: newTopicName }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


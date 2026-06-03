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

        const folders = await prisma.knowledgeFolder.findMany({
            where: { userId: dbUser.id },
            include: { _count: { select: { documents: true } } },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json({ success: true, folders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Create Folder
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { topicName } = await req.json();
        if (!topicName) return NextResponse.json({ error: "Topic Name required" }, { status: 400 });

        const dbUser = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
        if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const folder = await prisma.knowledgeFolder.create({
            data: {
                topicName,
                userId: dbUser.id
            },
            include: { _count: { select: { documents: true } } }
        });

        return NextResponse.json({ success: true, folder });
    } catch (error: any) {
        if (error.code === 'P2002') return NextResponse.json({ error: "A folder with this topic already exists." }, { status: 400 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
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


import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // CRITICAL FIX: Look up the actual database user ID
        const dbUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!dbUser) return NextResponse.json({ error: "User not found in database" }, { status: 404 });

        const { topicName, className, subject, parentId } = await req.json();
        if (!topicName) return NextResponse.json({ error: "Topic name is required" }, { status: 400 });

        if (parentId) {
            const parent = await prisma.knowledgeFolder.findFirst({
                where: { id: parentId, ...(session?.user?.role === "ADMIN" ? {} : { userId: dbUser.id }) },
                select: { id: true },
            });
            if (!parent) return NextResponse.json({ error: "Parent folder not found or not owned by you" }, { status: 403 });
        }

        const folder = await prisma.knowledgeFolder.create({
            data: {
                topicName,
                className: className || null,
                subject: subject || null,
                parentId: parentId || null,
                userId: dbUser.id
            }
        });

        return NextResponse.json({ success: true, folder });
    } catch (error: any) {
        console.error("Folder creation error:", error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: "A folder with this topic already exists." }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userRole = (session?.user as any)?.role;

        // If ADMIN, fetch all. If TEACHER, fetch only theirs.
        const whereClause = userRole === 'ADMIN' ? {} : { userId };

        console.log(`[SYNC DEBUG] Fetching folders for: ${userId} | Role: ${userRole} | Bypass Filter: ${userRole === 'ADMIN'}`);

        const folders = await prisma.knowledgeFolder.findMany({
            where: whereClause,
            include: {
                _count: {
                    select: { documents: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return NextResponse.json({ success: true, folders });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

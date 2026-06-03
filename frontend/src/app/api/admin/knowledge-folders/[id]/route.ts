import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session?.user as any);

        if (!user || !user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const folderId = (await params).id;

        // Fetch folder with ownership/role check
        const folder = await prisma.knowledgeFolder.findFirst({
            where: {
                id: folderId,
                OR: user.role === 'ADMIN' ? undefined : [
                    { userId: user.id },
                    { user: { role: 'ADMIN' } }
                ]
            },
            include: {
                documents: { orderBy: { createdAt: 'desc' } },
                user: { select: { role: true } }
            }
        });

        if (!folder) {
            return NextResponse.json({ error: "Folder not found or access denied" }, { status: 404 });
        }

        return NextResponse.json({ success: true, folder });

    } catch (error: any) {
        console.error("[GET-FOLDER-DETAIL]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session?.user as any);

        if (!user || !user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const folderId = (await params).id;
        const { topicName, className, subject } = await req.json();

        // Check ownership/role before update
        const folder = await prisma.knowledgeFolder.findFirst({
            where: {
                id: folderId,
                OR: user.role === 'ADMIN' ? undefined : [
                    { userId: user.id }
                ]
            }
        });

        if (!folder) {
            return NextResponse.json({ error: "Folder not found or permission denied" }, { status: 403 });
        }

        const updated = await prisma.knowledgeFolder.update({
            where: { id: folderId },
            data: {
                topicName: topicName !== undefined ? topicName : folder.topicName,
                className: className !== undefined ? className : folder.className,
                subject: subject !== undefined ? subject : folder.subject
            }
        });

        return NextResponse.json({ success: true, folder: updated });

    } catch (error: any) {
        console.error("[PATCH-FOLDER]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session?.user as any);

        if (!user || !user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const folderId = (await params).id;

        // Admins can delete anything. Teachers only their own.
        const whereClause: any = { id: folderId };
        if (user.role !== 'ADMIN') {
            whereClause.userId = user.id;
        }

        const deleted = await prisma.knowledgeFolder.deleteMany({
            where: whereClause
        });

        if (deleted.count === 0) {
            return NextResponse.json({ error: "Folder not found or permission denied" }, { status: 403 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("[DELETE-FOLDER]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

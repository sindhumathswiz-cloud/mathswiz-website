import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET /api/knowledge-folders/[id]/chunks
// Returns all DocumentChunks associated with a knowledge folder
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: folderId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session.user.role) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        if (!folderId) {
            return NextResponse.json({ success: false, error: "Folder ID is required" }, { status: 400 });
        }

        const chunks = await prisma.documentChunk.findMany({
            where: {
                folderId,
                ...(session.user.role === "ADMIN" ? {} : { folder: { userId: session.user.id } }),
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            success: true,
            chunks
        });
    } catch (error: any) {
        console.error("[CHUNKS-FETCH] Error:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch chunks" }, { status: 500 });
    }
}

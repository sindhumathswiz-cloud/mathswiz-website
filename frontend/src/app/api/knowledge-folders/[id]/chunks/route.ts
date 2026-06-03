import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/knowledge-folders/[id]/chunks
// Returns all DocumentChunks associated with a knowledge folder
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: folderId } = await params;

        if (!folderId) {
            return NextResponse.json({ success: false, error: "Folder ID is required" }, { status: 400 });
        }

        const chunks = await prisma.documentChunk.findMany({
            where: { folderId },
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

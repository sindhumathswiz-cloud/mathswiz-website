import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Persists already-extracted text (e.g. OCR'd PDF pages, assembled client-side)
 * as a single KnowledgeDocument. Complements extract-multi/extract-url, which
 * extract AND persist in one call — this route only persists.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 401 });
        }

        const { folderId, title, sourceType, content } = await req.json();
        if (!folderId || !content?.trim()) {
            return NextResponse.json({ error: "folderId and content are required" }, { status: 400 });
        }

        const doc = await prisma.knowledgeDocument.create({
            data: {
                folderId,
                title: title || "Untitled Source",
                sourceType: sourceType || "TEXT",
                content
            }
        });

        return NextResponse.json({ success: true, document: doc });
    } catch (error: any) {
        console.error("[ADMIN-KNOWLEDGE-DOCUMENT-CREATE]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

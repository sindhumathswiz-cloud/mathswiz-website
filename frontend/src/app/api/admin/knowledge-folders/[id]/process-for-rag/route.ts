import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { splitIntoChunks, extractTags } from "@/lib/chunking";
import { generateEmbedding } from "@/lib/embeddings";
import { insertChunk, getChunkCount } from "@/lib/vector-store";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userRole = (session.user as any).role;

    const { id: folderId } = await params;

    const folder = await prisma.knowledgeFolder.findUnique({
      where: { id: folderId },
      include: {
        documents: { where: { isActive: true } },
      }
    });

    if (!folder) {
      return NextResponse.json({ success: false, error: "Folder not found" }, { status: 404 });
    }

    // Auth: Admin can process any folder, teacher only their own
    if (userRole !== 'ADMIN' && folder.userId !== (session.user as any).id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    if (folder.documents.length === 0) {
      return NextResponse.json({ success: false, error: "No active documents in this folder" }, { status: 400 });
    }

    // Combine all document text
    const allText = folder.documents.map(d => `[${d.title}]\n${d.content}`).join('\n\n---\n\n');
    if (!allText.trim()) {
      return NextResponse.json({ success: false, error: "Documents have no text content" }, { status: 400 });
    }

    // Split into chunks
    const chunks = splitIntoChunks(allText);
    let successCount = 0;
    let errorCount = 0;

    // Clear existing chunks for this folder
    await prisma.$executeRawUnsafe(`DELETE FROM "DocumentChunk" WHERE "folderId" = $1`, folderId);

    // Process chunks sequentially with embeddings
    for (const chunk of chunks) {
      try {
        const tags = extractTags(chunk.content);
        // Add folder-level tags
        if (folder.topicName) tags.push(folder.topicName.toUpperCase().replace(/\s+/g, '_'));
        if (folder.className) tags.push(folder.className.toUpperCase().replace(/\s+/g, '_'));
        if (folder.subject) tags.push(folder.subject.toUpperCase().replace(/\s+/g, '_'));

        const embedding = await generateEmbedding(chunk.content);
        await insertChunk(folderId, chunk.content, embedding, [...new Set(tags)]);
        successCount++;
      } catch (e) {
        errorCount++;
        console.error(`[RAG-PROCESS] Chunk ${chunk.index} failed:`, e);
      }
    }

    const totalChunks = await getChunkCount(folderId);

    return NextResponse.json({
      success: true,
      folderId,
      chunksCreated: successCount,
      chunksFailed: errorCount,
      totalChunks,
      documentsProcessed: folder.documents.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process folder for RAG";
    console.error("[RAG-PROCESS] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: folderId } = await params;

    const chunkCount = await getChunkCount(folderId);

    return NextResponse.json({
      success: true,
      folderId,
      chunkCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get chunk info";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

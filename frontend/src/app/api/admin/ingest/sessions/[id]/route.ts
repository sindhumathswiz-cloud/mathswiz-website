import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;

    const extractionSession = await prisma.extractionSession.findUnique({
      where: { id },
      include: {
        sourceDocument: {
          include: {
            pages: {
              orderBy: { pageNumber: 'asc' },
              select: { pageNumber: true, rawMarkdown: true },
            }
          }
        },
        solutionDocument: {
          include: {
            pages: {
              orderBy: { pageNumber: 'asc' },
              select: { pageNumber: true, rawMarkdown: true },
            }
          }
        }
      }
    });

    if (!extractionSession) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (extractionSession.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      session: {
        id: extractionSession.id,
        status: extractionSession.status,
        authoredQuestions: extractionSession.authoredQuestions,
        topicId: extractionSession.topicId,
        topicName: extractionSession.topicName,
        subjectName: extractionSession.subjectName,
        className: extractionSession.className,
        createdAt: extractionSession.createdAt,
        updatedAt: extractionSession.updatedAt,
        sourceDocument: extractionSession.sourceDocument ? {
          id: extractionSession.sourceDocument.id,
          title: extractionSession.sourceDocument.title,
          filePath: extractionSession.sourceDocument.filePath,
          totalPages: extractionSession.sourceDocument.totalPages,
          pages: extractionSession.sourceDocument.pages,
        } : null,
        solutionDocument: extractionSession.solutionDocument ? {
          id: extractionSession.solutionDocument.id,
          title: extractionSession.solutionDocument.title,
          filePath: extractionSession.solutionDocument.filePath,
          totalPages: extractionSession.solutionDocument.totalPages,
          pages: extractionSession.solutionDocument.pages,
        } : null,
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch session";
    console.error("[SESSION-GET] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;

    const existing = await prisma.extractionSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};

    if (body.authoredQuestions !== undefined) updateData.authoredQuestions = body.authoredQuestions;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.solutionDocumentId !== undefined) updateData.solutionDocumentId = body.solutionDocumentId;

    const updated = await prisma.extractionSession.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, session: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update session";
    console.error("[SESSION-PATCH] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;

    const existing = await prisma.extractionSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    await prisma.extractionSession.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete session";
    console.error("[SESSION-DELETE] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

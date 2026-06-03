import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role;
        const userId = (session.user as any).id;
        const questionId = (await params).id;

        // Check ownership/permission
        const existing = await prisma.question.findUnique({
            where: { id: questionId },
            select: { createdById: true, scope: true }
        });

        if (!existing) {
            return NextResponse.json({ error: "Question not found" }, { status: 404 });
        }

        // Admin can edit any question, teachers can only edit their own private questions
        if (role !== 'ADMIN' && !(role === 'TEACHER' && existing.scope === 'TEACHER_PRIVATE' && existing.createdById === userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const {
            status, reportedIssues,
            content, options, correctAnswer, explanation,
            type, difficulty, subject, class: classLevel, examType, tags,
            confidence, reviewNotes
        } = body;

        const updateData: any = {};
        if (status) updateData.status = status;
        if (reportedIssues !== undefined) updateData.reportedIssues = reportedIssues;
        if (content !== undefined) updateData.content = content;
        if (options !== undefined) updateData.options = options;
        if (correctAnswer !== undefined) updateData.correctAnswer = correctAnswer;
        if (explanation !== undefined) updateData.explanation = explanation;
        if (type !== undefined) updateData.type = type;
        if (difficulty !== undefined) updateData.difficulty = difficulty;
        if (subject !== undefined) updateData.subject = subject;
        if (classLevel !== undefined) updateData.class = classLevel;
        if (examType !== undefined) updateData.examType = examType;
        if (tags !== undefined) updateData.tags = tags;
        if (confidence !== undefined) updateData.confidence = confidence;
        if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;

        const question = await prisma.question.update({
            where: { id: questionId },
            data: updateData
        });

        return NextResponse.json({ success: true, question });
    } catch (error) {
        console.error("Failed to patch question:", error);
        return NextResponse.json({ error: "Failed to patch question" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
        }

        await prisma.question.delete({
            where: { id: (await params).id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete question:", error);
        return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
    }
}

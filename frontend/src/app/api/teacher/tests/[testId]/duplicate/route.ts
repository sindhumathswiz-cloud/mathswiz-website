import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

// Deep-copies a Test + its TestSections + TestQuestions into new,
// independent rows -- new ids throughout, unpublished, no TestAssignments
// carried over. This is what makes a template "reusable": duplicating it
// never mutates the original, and the copy is a normal editable Test.
export async function POST(_req: Request, { params }: { params: Promise<{ testId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (role !== "TEACHER" && role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { testId } = await params;
        const source = await prisma.test.findFirst({
            where: { id: testId, ...(role === "ADMIN" ? {} : { createdById: userId }) },
            include: { sections: { include: { questions: true } } },
        });
        if (!source) return NextResponse.json({ error: "Test not found or not owned by you" }, { status: 403 });

        const duplicate = await prisma.test.create({
            data: {
                title: `${source.title} (copy)`,
                description: source.description,
                class: source.class,
                mode: source.mode,
                duration: source.duration,
                totalMarks: source.totalMarks,
                isPublished: false,
                templateType: source.templateType,
                createdById: userId,
                sections: {
                    create: source.sections.map((section) => ({
                        title: section.title,
                        instructions: section.instructions,
                        marksPerQuestion: section.marksPerQuestion,
                        negativeMarks: section.negativeMarks,
                        questions: {
                            create: section.questions.map((q) => ({
                                questionId: q.questionId,
                                orderIndex: q.orderIndex,
                            })),
                        },
                    })),
                },
            },
            include: { sections: { include: { questions: true } } },
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: "TEST_DUPLICATED",
            entityType: "Test",
            entityId: duplicate.id,
            metadata: { sourceTestId: testId },
            ...requestAuditContext(_req),
        });

        return NextResponse.json({ success: true, test: duplicate });
    } catch (error: any) {
        console.error("Test Duplicate Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

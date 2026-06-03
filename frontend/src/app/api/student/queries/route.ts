import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { questionId, content } = body;

        const studentUser = await prisma.user.findUnique({
            where: { id: (session.user as any).id },
            include: { enrollments: { include: { batch: true } } }
        });

        if (!studentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Find the applicable teacher for this student.
        // Easiest heuristic: Teacher from their active batch.
        const activeEnrollment = studentUser.enrollments.find(e => e.status === "APPROVED");
        if (!activeEnrollment || !activeEnrollment.batch?.teacherId) {
            return NextResponse.json({ error: "You must be actively enrolled in a batch to escalate doubts." }, { status: 400 });
        }

        const query = await prisma.teacherQuery.create({
            data: {
                studentId: studentUser.id,
                teacherId: activeEnrollment.batch.teacherId,
                questionId: questionId || null,
                content: content || "Doubt escalation from Practice Arena."
            }
        });

        return NextResponse.json({ success: true, query });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

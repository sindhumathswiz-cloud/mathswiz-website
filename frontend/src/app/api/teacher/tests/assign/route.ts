import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (role !== "TEACHER" && role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { testId, batchId, studentId, scheduledFor, deadline, instructions } = body;
        const kind = body.kind === "HOMEWORK" ? "HOMEWORK" : "TEST";
        const maxAttempts = Number.isInteger(body.maxAttempts)
            ? Math.max(1, Math.min(body.maxAttempts, 10))
            : 1;

        if (!testId) return NextResponse.json({ error: "Missing testId" }, { status: 400 });
        if (!batchId && !studentId) return NextResponse.json({ error: "Must provide batchId or studentId" }, { status: 400 });
        if (batchId && studentId) return NextResponse.json({ error: "Assign to either a batch or a student, not both" }, { status: 400 });

        const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
        const deadlineDate = deadline ? new Date(deadline) : null;
        if (scheduledDate && Number.isNaN(scheduledDate.getTime())) return NextResponse.json({ error: "Invalid scheduledFor" }, { status: 400 });
        if (deadlineDate && Number.isNaN(deadlineDate.getTime())) return NextResponse.json({ error: "Invalid deadline" }, { status: 400 });
        if (scheduledDate && deadlineDate && deadlineDate <= scheduledDate) {
            return NextResponse.json({ error: "Deadline must be after the scheduled time" }, { status: 400 });
        }

        const test = await prisma.test.findFirst({
            where: { id: testId, ...(role === "ADMIN" ? {} : { createdById: userId }) },
            select: { id: true, isPublished: true },
        });
        if (!test) return NextResponse.json({ error: "Test not found or not owned by you" }, { status: 403 });
        if (!test.isPublished) return NextResponse.json({ error: "Publish the test before assigning it" }, { status: 400 });

        if (batchId) {
            const batch = await prisma.batch.findFirst({
                where: { id: batchId, ...(role === "ADMIN" ? {} : { teacherId: userId }) },
                select: { id: true },
            });
            if (!batch) return NextResponse.json({ error: "Batch not found or not owned by you" }, { status: 403 });
        }

        if (studentId && role !== "ADMIN") {
            const enrollment = await (prisma as any).batchEnrollment.findFirst({
                where: { studentId, status: "APPROVED", batch: { teacherId: userId } },
                select: { id: true },
            });
            if (!enrollment) return NextResponse.json({ error: "Student is not enrolled in one of your batches" }, { status: 403 });
        }

        const assignment = await (prisma as any).testAssignment.create({
            data: {
                testId,
                batchId: batchId || null,
                studentId: studentId || null,
                scheduledFor: scheduledDate,
                deadline: deadlineDate,
                maxAttempts,
                kind,
                instructions: typeof instructions === "string" ? instructions.trim().slice(0, 2000) || null : null,
            }
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: kind === "HOMEWORK" ? "HOMEWORK_ASSIGNED" : "TEST_ASSIGNED",
            entityType: "TestAssignment",
            entityId: assignment.id,
            metadata: { testId, batchId: batchId || null, studentId: studentId || null, scheduledFor: scheduledDate, deadline: deadlineDate, maxAttempts },
            ...requestAuditContext(req),
        });

        return NextResponse.json(assignment, { status: 201 });
    } catch (error: any) {
        console.error("Test Assignment Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


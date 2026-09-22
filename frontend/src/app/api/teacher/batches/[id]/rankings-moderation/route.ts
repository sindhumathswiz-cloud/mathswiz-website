import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

// Teacher-only moderation lever: hide one student's entry from this
// batch's leaderboard and class challenges without unenrolling them.
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: batchId } = await params;
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { studentId, excludedFromRankings } = body as { studentId?: unknown; excludedFromRankings?: unknown };
        if (typeof studentId !== "string" || !studentId) {
            return NextResponse.json({ error: "studentId is required" }, { status: 400 });
        }
        if (typeof excludedFromRankings !== "boolean") {
            return NextResponse.json({ error: "excludedFromRankings must be a boolean" }, { status: 400 });
        }

        const batch = await prisma.batch.findFirst({
            where: { id: batchId, ...(role === "ADMIN" ? {} : { teacherId: userId }) },
            select: { id: true },
        });
        if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

        const enrollment = await prisma.batchEnrollment.findFirst({
            where: { batchId, studentId },
            select: { id: true },
        });
        if (!enrollment) return NextResponse.json({ error: "Student is not enrolled in this batch" }, { status: 404 });

        const updated = await prisma.batchEnrollment.update({
            where: { id: enrollment.id },
            data: { excludedFromRankings },
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: "BATCH_STUDENT_RANKING_EXCLUSION_SET",
            entityType: "BatchEnrollment",
            entityId: enrollment.id,
            metadata: { batchId, studentId, excludedFromRankings },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ enrollment: updated });
    } catch (error: any) {
        console.error("Rankings Moderation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

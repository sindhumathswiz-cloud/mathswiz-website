import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    noStore();
    try {
        const { id: batchId } = await params;
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        
        const batch = await prisma.batch.findFirst({
            where: { id: batchId, ...(role === "ADMIN" ? {} : { teacherId: userId }) },
            include: { teacher: true }
        });

        if (!batch) {
            return NextResponse.json({ error: "Batch not found" }, { status: 404 });
        }

        const enrollments = await (prisma as any).batchEnrollment.findMany({
            where: { batchId },
            include: { 
                student: true,
                feeStructure: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ batch, enrollments });
    } catch (error: any) {
        console.error("Batch Detail API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

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
        const { leaderboardEnabled } = body as { leaderboardEnabled?: unknown };
        if (typeof leaderboardEnabled !== "boolean") {
            return NextResponse.json({ error: "leaderboardEnabled must be a boolean" }, { status: 400 });
        }

        const batch = await prisma.batch.findFirst({
            where: { id: batchId, ...(role === "ADMIN" ? {} : { teacherId: userId }) },
            select: { id: true },
        });
        if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

        const updated = await prisma.batch.update({
            where: { id: batchId },
            data: { leaderboardEnabled },
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: "BATCH_LEADERBOARD_TOGGLED",
            entityType: "Batch",
            entityId: batchId,
            metadata: { leaderboardEnabled },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ batch: updated });
    } catch (error: any) {
        console.error("Batch Leaderboard Toggle Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

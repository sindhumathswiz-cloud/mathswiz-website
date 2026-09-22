import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

const VALID_STATUSES = ["ENDED", "CANCELLED"];

// Ends or cancels a class challenge. There is no "resume" -- once a
// challenge leaves ACTIVE it stays ended, same one-way lifecycle as a
// TestAssignment close-out.
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string; challengeId: string }> }
) {
    try {
        const { id: batchId, challengeId } = await params;
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const batch = await (prisma as any).batch.findFirst({
            where: { id: batchId, ...(role === "ADMIN" ? {} : { teacherId: userId }) },
            select: { id: true },
        });
        if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const { status } = body as { status?: unknown };
        if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
        }

        const challenge = await (prisma as any).classChallenge.findFirst({
            where: { id: challengeId, batchId },
        });
        if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
        if (challenge.status !== "ACTIVE") {
            return NextResponse.json({ error: "This challenge has already ended" }, { status: 409 });
        }

        const updated = await (prisma as any).classChallenge.update({
            where: { id: challengeId },
            data: { status, endedAt: new Date(), endedBy: userId },
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: status === "ENDED" ? "CLASS_CHALLENGE_ENDED" : "CLASS_CHALLENGE_CANCELLED",
            entityType: "ClassChallenge",
            entityId: challengeId,
            metadata: { batchId },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ challenge: updated });
    } catch (error: any) {
        console.error("Class Challenge PATCH Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

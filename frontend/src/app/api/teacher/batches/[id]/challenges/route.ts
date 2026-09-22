import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";
import { computeChallengeRanking } from "@/lib/class-challenge";

const VALID_METRICS = ["MOST_PRACTICE", "MASTERY_GAIN", "POINTS_EARNED"];

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: batchId } = await params;
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const batch = await (prisma as any).batch.findFirst({
            where: { id: batchId, ...(role === "ADMIN" ? {} : { teacherId: userId }) },
            select: { id: true },
        });
        if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

        const challenges = await (prisma as any).classChallenge.findMany({
            where: { batchId },
            orderBy: { createdAt: "desc" },
            take: 20,
        });

        const withRanking = await Promise.all(
            challenges.map(async (challenge: any) => ({
                ...challenge,
                ranking: await computeChallengeRanking(prisma as any, challenge),
            }))
        );

        return NextResponse.json({ challenges: withRanking });
    } catch (error: any) {
        console.error("Class Challenges GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: batchId } = await params;
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
        const { title, metric, startDate, endDate } = body as Record<string, unknown>;

        if (typeof title !== "string" || !title.trim()) {
            return NextResponse.json({ error: "title is required" }, { status: 400 });
        }
        if (typeof metric !== "string" || !VALID_METRICS.includes(metric)) {
            return NextResponse.json({ error: `metric must be one of ${VALID_METRICS.join(", ")}` }, { status: 400 });
        }
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
            return NextResponse.json({ error: "startDate/endDate must be valid dates with endDate after startDate" }, { status: 400 });
        }

        const existingActive = await (prisma as any).classChallenge.findFirst({
            where: { batchId, status: "ACTIVE" },
            select: { id: true },
        });
        if (existingActive) {
            return NextResponse.json({ error: "This batch already has an active challenge. End it before creating a new one." }, { status: 409 });
        }

        const challenge = await (prisma as any).classChallenge.create({
            data: {
                batchId,
                title: title.trim(),
                metric,
                startDate: start,
                endDate: end,
                createdById: userId,
            },
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: "CLASS_CHALLENGE_CREATED",
            entityType: "ClassChallenge",
            entityId: challenge.id,
            metadata: { batchId, title: challenge.title, metric, startDate: start, endDate: end },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ challenge }, { status: 201 });
    } catch (error: any) {
        console.error("Class Challenges POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

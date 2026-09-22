import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { computeChallengeRanking } from "@/lib/class-challenge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const studentId = (session.user as any).id;
        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get("batchId");

        let targetBatchId = batchId;
        if (!targetBatchId) {
            const enrollments = await (prisma as any).batchEnrollment.findMany({
                where: { studentId, status: "APPROVED" },
                select: { batchId: true },
                take: 1,
            });
            targetBatchId = enrollments[0]?.batchId;
        }

        if (!targetBatchId) {
            return NextResponse.json({ challenge: null, ranking: [], userRank: null });
        }

        const ownEnrollment = await (prisma as any).batchEnrollment.findFirst({
            where: { batchId: targetBatchId, studentId, status: "APPROVED" },
            select: { id: true },
        });
        if (!ownEnrollment) {
            return NextResponse.json({ error: "You are not enrolled in this batch" }, { status: 403 });
        }

        const challenge = await (prisma as any).classChallenge.findFirst({
            where: { batchId: targetBatchId, status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
        });

        if (!challenge) {
            return NextResponse.json({ challenge: null, ranking: [], userRank: null, batchId: targetBatchId });
        }

        const ranking = await computeChallengeRanking(prisma as any, challenge);
        const userEntry = ranking.find((e) => e.userId === studentId);

        return NextResponse.json({
            challenge,
            ranking,
            userRank: userEntry?.rank ?? null,
            batchId: targetBatchId,
        });
    } catch (error: any) {
        console.error("Error fetching class challenge:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

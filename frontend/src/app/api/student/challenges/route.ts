import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { opponentId, topic } = body;

        if (!opponentId || !topic) {
            return NextResponse.json({ error: "Opponent and Topic are required" }, { status: 400 });
        }

        const studentUser = await (prisma as any).user.findUnique({ where: { id: (session.user as any).id } });
        if (!studentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        if (studentUser.id === opponentId) {
            return NextResponse.json({ error: "You cannot challenge yourself!" }, { status: 400 });
        }

        const challenge = await (prisma as any).peerChallenge.create({
            data: {
                topic,
                challengerId: studentUser.id,
                opponentId
            },
            include: {
                challenger: { select: { firstName: true, lastName: true } },
                opponent: { select: { firstName: true, lastName: true } },
            },
        });

        return NextResponse.json({ success: true, challenge });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';
    const studentId = (session.user as any).id;

    try {
        let whereClause: any = {
            OR: [
                { challengerId: studentId },
                { opponentId: studentId },
            ],
        };

        if (type === 'incoming') {
            whereClause = { opponentId: studentId, status: 'PENDING' };
        } else if (type === 'active') {
            whereClause = {
                OR: [
                    { challengerId: studentId },
                    { opponentId: studentId },
                ],
                status: 'ACCEPTED',
            };
        } else if (type === 'completed') {
            whereClause = {
                OR: [
                    { challengerId: studentId },
                    { opponentId: studentId },
                ],
                status: 'COMPLETED',
            };
        }

        const challenges = await (prisma as any).peerChallenge.findMany({
            where: whereClause,
            include: {
                challenger: { select: { id: true, firstName: true, lastName: true, image: true } },
                opponent: { select: { id: true, firstName: true, lastName: true, image: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ success: true, challenges });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { challengeId, action, winnerId } = body;
        const studentId = (session.user as any).id;

        const challenge = await (prisma as any).peerChallenge.findUnique({
            where: { id: challengeId },
        });

        if (!challenge) {
            return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
        }

        if (challenge.opponentId !== studentId && action !== 'complete') {
            return NextResponse.json({ error: "Only the opponent can accept/decline" }, { status: 403 });
        }

        let newStatus = challenge.status;
        if (action === 'accept') newStatus = 'ACCEPTED';
        else if (action === 'decline') newStatus = 'DECLINED';
        else if (action === 'complete') newStatus = 'COMPLETED';

        const updated = await (prisma as any).peerChallenge.update({
            where: { id: challengeId },
            data: {
                status: newStatus,
                winnerId: winnerId || null,
            },
            include: {
                challenger: { select: { firstName: true, lastName: true } },
                opponent: { select: { firstName: true, lastName: true } },
            },
        });

        return NextResponse.json({ success: true, challenge: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

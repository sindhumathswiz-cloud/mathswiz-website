import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const testId = searchParams.get('testId');
        if (!testId) return NextResponse.json({ error: "testId is required" }, { status: 400 });

        const ownAttempt = await prisma.testAttempt.findFirst({
            where: { testId, userId: session.user.id, status: "COMPLETED" },
            select: { id: true },
        });
        if (!ownAttempt) return NextResponse.json({ error: "You do not have access to analytics for this test" }, { status: 403 });

        // Retrieve all attempts for this test
        const attempts = await prisma.testAttempt.findMany({
            where: { testId, status: "COMPLETED" },
            select: { totalScore: true }
        });

        if (attempts.length === 0) {
            return NextResponse.json({ success: true, avg: 0, topper: 0 });
        }

        const validScores = attempts.map(a => a.totalScore).filter(s => s !== null && s !== undefined);
        const avg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
        const topper = validScores.length > 0 ? Math.max(...validScores) : 0;

        return NextResponse.json({ success: true, avg: Math.round(avg), topper });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

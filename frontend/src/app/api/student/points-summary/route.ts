import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTotalPoints, getUserPointsHistory } from "@/lib/gamification";

export const dynamic = "force-dynamic";

// Thin wrapper over already-exported gamification.ts functions -- zero new
// query logic, just a route surface for the previously-unwired points total.
export async function GET() {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId || session?.user?.role !== "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [totalPoints, history] = await Promise.all([
        getUserTotalPoints(userId),
        getUserPointsHistory(userId, 10),
    ]);

    return NextResponse.json({ totalPoints, history });
}

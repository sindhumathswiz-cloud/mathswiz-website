import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        if (!userId || session?.user?.role !== "STUDENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { leaderboardOptIn: true },
        });

        return NextResponse.json({ leaderboardOptIn: Boolean(user?.leaderboardOptIn) });
    } catch (error: any) {
        console.error("Student Preferences Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        if (!userId || session?.user?.role !== "STUDENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { leaderboardOptIn } = body as { leaderboardOptIn?: unknown };
        if (typeof leaderboardOptIn !== "boolean") {
            return NextResponse.json({ error: "leaderboardOptIn must be a boolean" }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { leaderboardOptIn },
            select: { id: true, leaderboardOptIn: true },
        });

        return NextResponse.json({ user });
    } catch (error: any) {
        console.error("Student Preferences Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

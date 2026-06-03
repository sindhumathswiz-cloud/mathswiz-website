import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let teacherId = searchParams.get("teacherId");
        const session = await getServerSession(authOptions);

        // 🩺 IDENTITY HEALING: Always lookup the DB-persistent CUID
        const sessionUserId = (session?.user as any)?.id;
        const dbUser = sessionUserId ? await prisma.user.findUnique({ 
            where: { id: sessionUserId } 
        }) : null;

        const activeTeacherId = dbUser?.id || teacherId || sessionUserId;

        if (!activeTeacherId) {
            return NextResponse.json({ error: "Unauthorized: No valid session or ID found." }, { status: 401 });
        }

        // Fetch batches for this teacher
        const batches = await (prisma as any).batch.findMany({
            where: { teacherId: activeTeacherId },
            select: { id: true, name: true }
        });

        const batchIds = batches.map((b: any) => b.id);

        // Fetch live classes for these batches
        const liveClasses = await (prisma as any).liveClass.findMany({
            where: { 
                batchId: { in: batchIds }
            },
            include: { batch: { select: { name: true } } },
            orderBy: { startTime: 'desc' },
            take: 100
        });

        return NextResponse.json({ success: true, liveClasses });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


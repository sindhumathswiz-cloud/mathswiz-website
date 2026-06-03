import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { testId, batchId, studentId, scheduledFor, deadline } = body; 

        if (!testId) return NextResponse.json({ error: "Missing testId" }, { status: 400 });
        if (!batchId && !studentId) return NextResponse.json({ error: "Must provide batchId or studentId" }, { status: 400 });

        const assignment = await (prisma as any).testAssignment.create({
            data: {
                testId,
                batchId: batchId || null,
                studentId: studentId || null,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
                deadline: deadline ? new Date(deadline) : null
            }
        });

        return NextResponse.json(assignment);
    } catch (error: any) {
        console.error("Test Assignment Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


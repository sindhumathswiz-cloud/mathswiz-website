import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const studentId = session?.user?.id;
        if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const enrollments = await (prisma as any).batchEnrollment.findMany({
            where: { studentId },
            include: {
                batch: {
                    include: { teacher: true }
                }
            },
            take: 50
        });

        return NextResponse.json(enrollments || []);
    } catch (error: any) {
        console.error("Student Batches GET Error:", error);
        return NextResponse.json({ error: "Failed to load batches" }, { status: 500 });
    }
}


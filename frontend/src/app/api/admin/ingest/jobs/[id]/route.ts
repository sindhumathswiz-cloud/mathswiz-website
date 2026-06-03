import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role === "STUDENT" || (session.user as any).role === "PARENT") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const jobId = (await params).id;

        // Verify the job exists and belongs to the user (unless they are ADMIN)
        const job = await prisma.ingestionJob.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
        }

        if ((session.user as any).role === "TEACHER" && job.userId !== (session.user as any).id) {
            return NextResponse.json({ success: false, error: "Forbidden: You can only delete your own jobs" }, { status: 403 });
        }

        await prisma.ingestionJob.delete({
            where: { id: jobId }
        });

        return NextResponse.json({ success: true, message: "Job cancelled and deleted." });

    } catch (error: any) {
        console.error(`[DELETE-JOB] Error:`, error);
        return NextResponse.json(
            { success: false, error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}

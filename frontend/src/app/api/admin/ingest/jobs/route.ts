import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/admin/ingest/jobs
// Returns all IngestionJob records for the live-updating dashboard table
export async function GET() {
    try {
        const jobs = await prisma.ingestionJob.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return NextResponse.json({ success: true, jobs });
    } catch (error: any) {
        console.error("[INGEST-JOBS] Failed to fetch jobs:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Failed to fetch jobs" },
            { status: 500 }
        );
    }
}

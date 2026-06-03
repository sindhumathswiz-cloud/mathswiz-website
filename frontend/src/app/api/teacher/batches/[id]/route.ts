import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    noStore();
    try {
        const { id: batchId } = await params;
        
        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            include: { teacher: true }
        });

        if (!batch) {
            return NextResponse.json({ error: "Batch not found" }, { status: 404 });
        }

        const enrollments = await (prisma as any).batchEnrollment.findMany({
            where: { batchId },
            include: { 
                student: true,
                feeStructure: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ batch, enrollments });
    } catch (error: any) {
        console.error("Batch Detail API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

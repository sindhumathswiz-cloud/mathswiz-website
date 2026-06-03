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
        const { batchId, studentId, feeStructureId } = body; 

        if (!batchId || !studentId) {
            return NextResponse.json({ error: "Missing batchId or studentId" }, { status: 400 });
        }

        // Check if enrollment already exists
        const existing = await (prisma as any).batchEnrollment.findFirst({
            where: { batchId, studentId }
        });

        if (existing) {
            return NextResponse.json({ error: "Student is already enrolled in this batch" }, { status: 400 });
        }

        // Create the enrollment (using transaction to generate payments if feeStructure exists)
        const result = await prisma.$transaction(async (tx) => {
            const enrollment = await (tx as any).batchEnrollment.create({
                data: {
                    batchId,
                    studentId,
                    feeStructureId: feeStructureId || null,
                    status: 'APPROVED' // Auto approve if added by teacher
                }
            });

            // If fee structure is assigned, generate payment records
            if (feeStructureId) {
                const feeStructure = await (tx as any).feeStructure.findUnique({
                    where: { id: feeStructureId }
                });

                if (feeStructure && feeStructure.installments) {
                    const installments = feeStructure.installments as Array<{ amount: number, description: string, dueOffsetDays: number }>;
                    
                    const paymentRecords = installments.map((inst: any) => {
                        const dueDate = new Date();
                        dueDate.setDate(dueDate.getDate() + (inst.dueOffsetDays || 0));
                        return {
                            enrollmentId: enrollment.id,
                            amount: inst.amount,
                            description: inst.description,
                            dueDate: dueDate,
                            status: 'UPCOMING'
                        };
                    });

                    if (paymentRecords.length > 0) {
                        await (tx as any).paymentRecord.createMany({
                            data: paymentRecords
                        });
                    }
                }
            }

            return enrollment;
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Add Student Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


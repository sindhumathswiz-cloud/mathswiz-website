import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params; // The BatchEnrollment ID
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { status, feeStructureId } = body; 

        if (status !== 'APPROVED' && status !== 'REJECTED') {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const enrollmentAccess = await (prisma as any).batchEnrollment.findFirst({
            where: { id, batch: { teacherId: userId } },
            select: { id: true, batch: { select: { teacherId: true } } },
        });
        if (!enrollmentAccess) return NextResponse.json({ error: "Enrollment not found or not owned by you" }, { status: 403 });

        if (feeStructureId) {
            const ownedFee = await (prisma as any).feeStructure.findFirst({
                where: { id: feeStructureId, teacherId: userId },
                select: { id: true },
            });
            if (!ownedFee) return NextResponse.json({ error: "Fee structure not found or not owned by you" }, { status: 403 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updateData: any = { status };
            if (feeStructureId) {
                updateData.feeStructureId = feeStructureId;
            }

            const enrollment = await (tx as any).batchEnrollment.update({
                where: { id },
                data: updateData
            });

            // If approving with a fee structure, generate payments
            if (status === 'APPROVED' && enrollment.feeStructureId) {
                // Check if payments already exist to avoid duplicates
                const existingPayments = await (tx as any).paymentRecord.findFirst({
                    where: { enrollmentId: id }
                });

                if (!existingPayments) {
                    const feeStructure = await (tx as any).feeStructure.findUnique({
                        where: { id: enrollment.feeStructureId }
                    });

                    if (feeStructure && feeStructure.installments) {
                        const installments = feeStructure.installments as Array<{ amount: number, description: string, dueOffsetDays: number }>;
                        
                        const paymentRecords = installments.map((inst: any) => {
                            const dueDate = new Date();
                            dueDate.setDate(dueDate.getDate() + (inst.dueOffsetDays || 0));
                            return {
                                enrollmentId: id,
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
            }

            return enrollment;
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Batch Request Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

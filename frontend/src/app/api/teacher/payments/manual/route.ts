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
        const teacherId = userId;

        const body = await req.json();
        const { paymentId, recordedMode } = body; 

        if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

        const payment = await (prisma as any).paymentRecord.findUnique({
            where: { id: paymentId },
            include: { enrollment: { include: { batch: true } } }
        });

        if (!payment) return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
        
        // Security check: Ensure this teacher owns this batch payment
        if (payment.enrollment.batch.teacherId !== teacherId) {
            return NextResponse.json({ error: "Unauthorized to modify this record" }, { status: 403 });
        }

        const updatedPayment = await (prisma as any).paymentRecord.update({
            where: { id: paymentId },
            data: {
                status: 'PAID',
                paidAt: new Date(),
                recordedBy: teacherId,
                transactionId: `MANUAL_${recordedMode || 'CASH'}_${Date.now()}`
            }
        });

        return NextResponse.json(updatedPayment);
    } catch (error: any) {
        console.error("Manual Payment Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


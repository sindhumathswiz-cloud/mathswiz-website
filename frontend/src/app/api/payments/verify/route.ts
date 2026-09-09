import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const studentId = session?.user?.id;
        if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { paymentId, transactionId } = body;

        if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

        const payment = await (prisma as any).paymentRecord.findFirst({
            where: { id: paymentId, enrollment: { studentId } },
        });
        if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

        const updated = await (prisma as any).paymentRecord.update({
            where: { id: paymentId },
            data: {
                status: 'PAID',
                transactionId: transactionId || `TXN_${Date.now()}`,
                paidAt: new Date(),
                recordedBy: 'SYSTEM_WEBHOOK'
            }
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Payment Verification Webhook Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


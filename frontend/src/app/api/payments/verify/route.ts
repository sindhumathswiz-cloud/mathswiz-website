import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { paymentId, transactionId, status } = body; 

        if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

        const payment = await (prisma as any).paymentRecord.findUnique({ where: { id: paymentId } });
        if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

        const updated = await (prisma as any).paymentRecord.update({
            where: { id: paymentId },
            data: {
                status: status || 'PAID',
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


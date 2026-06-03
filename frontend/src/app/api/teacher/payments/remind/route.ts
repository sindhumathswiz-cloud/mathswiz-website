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
        const { paymentId } = body; 

        if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

        const payment = await (prisma as any).paymentRecord.findUnique({
            where: { id: paymentId },
            include: {
                enrollment: {
                    include: {
                        student: true,
                        batch: true
                    }
                }
            }
        });

        if (!payment) return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
        if (payment.status === 'PAID') return NextResponse.json({ error: "Payment is already marked as PAID" }, { status: 400 });

        // MOCK EMAIL/SMS SENDING LOGIC
        console.log(`[MOCK NOTIFICATION] Sent reminder to ${payment.enrollment.student.email} for ${payment.description} amount ₹${payment.amount} due on ${payment.dueDate}`);

        return NextResponse.json({ success: true, message: "Reminder sent successfully" });
    } catch (error: any) {
        console.error("Payment Reminder Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


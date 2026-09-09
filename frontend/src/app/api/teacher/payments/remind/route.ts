import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const teacherId = session?.user?.id;
        if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { paymentId } = await req.json();
        if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

        const payment = await (prisma as any).paymentRecord.findFirst({
            where: { id: paymentId, enrollment: { batch: { teacherId } } },
            include: { enrollment: { include: { student: true, batch: true } } },
        });
        if (!payment) return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
        if (payment.status === "PAID") {
            return NextResponse.json({ error: "Payment is already marked as PAID" }, { status: 400 });
        }

        const dueText = payment.dueDate
            ? ` on ${new Date(payment.dueDate).toLocaleDateString("en-IN")}`
            : "";
        await (prisma as any).notification.create({
            data: {
                userId: payment.enrollment.student.id,
                title: "Fee payment reminder",
                message: `${payment.description}: ₹${payment.amount.toLocaleString("en-IN")} is due${dueText}.`,
                type: "FEE_DUE",
                targetBatchId: payment.enrollment.batch.id,
            },
        });

        return NextResponse.json({ success: true, message: "In-app reminder created successfully" });
    } catch (error: any) {
        console.error("Payment Reminder Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

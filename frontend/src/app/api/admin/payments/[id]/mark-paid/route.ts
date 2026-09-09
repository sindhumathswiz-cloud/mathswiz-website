import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await getServerSession(authOptions);
        if (!session || !['ADMIN', 'TEACHER'].includes((session.user as any).role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { paidAt } = await req.json();

        if ((session.user as any).role === 'TEACHER') {
            const payment = await (prisma as any).paymentRecord.findUnique({
                where: { id },
                select: { enrollment: { select: { batch: { select: { teacherId: true } } } } }
            });
            if (!payment || payment.enrollment.batch.teacherId !== (session.user as any).id) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const updatedPayment = await (prisma as any).paymentRecord.update({
            where: { id },
            data: {
                status: 'PAID',
                paidAt: paidAt ? new Date(paidAt) : new Date()
            },
            include: {
                enrollment: {
                    include: {
                        student: {
                            select: { firstName: true, lastName: true, email: true, mobileNumber: true }
                        },
                        batch: {
                            select: { name: true }
                        }
                    }
                }
            }
        });

        await recordAuditLog({
            actorId: (session.user as any).id,
            actorRole: (session.user as any).role,
            action: "PAYMENT_MARKED_PAID",
            entityType: "PaymentRecord",
            entityId: id,
            metadata: { paidAt: updatedPayment.paidAt?.toISOString?.() || null },
            ...requestAuditContext(req),
        });

        return NextResponse.json(updatedPayment);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

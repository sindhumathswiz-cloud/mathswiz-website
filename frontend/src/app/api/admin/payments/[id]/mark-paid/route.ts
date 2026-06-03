import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await getServerSession(authOptions);
        if (!session || !['ADMIN', 'TEACHER'].includes((session.user as any).role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { paidAt } = await req.json();

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

        return NextResponse.json(updatedPayment);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

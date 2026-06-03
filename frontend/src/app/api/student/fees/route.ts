import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;

    // Get student's enrollments
    const enrollments = await (prisma as any).batchEnrollment.findMany({
      where: { studentId, status: 'APPROVED' },
      include: {
        batch: { select: { name: true } },
        feeStructure: true,
        payments: true,
      },
    });

    const feeStatus = enrollments.map((enrollment: any) => {
      const feeStructure = enrollment.feeStructure;
      const payments = enrollment.payments || [];

      if (!feeStructure) {
        return {
          batchName: enrollment.batch.name,
          hasFeeStructure: false,
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          installments: [],
        };
      }

      const installments = feeStructure.installments || [];
      const totalAmount = feeStructure.totalAmount;
      const paidAmount = payments
        .filter((p: any) => p.status === 'PAID')
        .reduce((sum: number, p: any) => sum + p.amount, 0);
      const pendingAmount = totalAmount - paidAmount;

      const installmentDetails = installments.map((inst: any, idx: number) => {
        const payment = payments[idx];
        const dueDate = payment?.dueDate ? new Date(payment.dueDate) : null;
        const isOverdue = dueDate && dueDate < new Date() && payment?.status !== 'PAID';

        return {
          description: inst.description || `Installment ${idx + 1}`,
          amount: inst.amount,
          status: payment?.status || 'UPCOMING',
          dueDate: dueDate?.toISOString(),
          isOverdue: !!isOverdue,
          paidAt: payment?.paidAt?.toISOString(),
        };
      });

      return {
        batchName: enrollment.batch.name,
        hasFeeStructure: true,
        totalAmount,
        paidAmount,
        pendingAmount,
        installments: installmentDetails,
      };
    });

    // Summary
    const totalPending = feeStatus.reduce((sum: number, f: any) => sum + f.pendingAmount, 0);
    const overdueCount = feeStatus.flatMap((f: any) => f.installments)
      .filter((i: any) => i.isOverdue).length;

    return NextResponse.json({
      success: true,
      feeStatus,
      summary: {
        totalPending,
        overdueCount,
        batchesWithFees: feeStatus.filter((f: any) => f.hasFeeStructure).length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching fee status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

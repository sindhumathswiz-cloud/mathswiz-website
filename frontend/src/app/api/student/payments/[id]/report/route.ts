import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { normalizeUpiReference, PAYMENT_PENDING_VERIFICATION, REPORTABLE_PAYMENT_STATUSES } from '@/lib/payment-details';

export const dynamic = 'force-dynamic';

/**
 * A student says they have paid one of their own fees by UPI and gives the payment's reference number. The fee becomes
 * PENDING_VERIFICATION; it is marked PAID only when a teacher or admin confirms it (feeActions / admin mark-paid).
 * A reference can be corrected while the fee is still waiting; a confirmed fee cannot be reported again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'STUDENT') {
    return NextResponse.json({ error: 'Sign in as a student to report a payment.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reference = normalizeUpiReference(body?.reference);
  if (!reference) {
    return NextResponse.json(
      { error: 'Enter the UPI transaction ID from your payment app: usually 12 digits (the UTR).' },
      { status: 400 },
    );
  }

  const payment = await prisma.paymentRecord.findFirst({
    where: { id, enrollment: { studentId: user.id } },
    select: { id: true, status: true, amount: true, description: true, enrollment: { select: { batch: { select: { teacherId: true, name: true } } } } },
  });
  if (!payment) return NextResponse.json({ error: 'Fee not found.' }, { status: 404 });
  if (!(REPORTABLE_PAYMENT_STATUSES as readonly string[]).includes(payment.status)) {
    return NextResponse.json({ error: 'This fee is already marked paid.' }, { status: 409 });
  }

  const updated = await prisma.paymentRecord.update({
    where: { id: payment.id },
    data: { status: PAYMENT_PENDING_VERIFICATION, transactionId: reference, paymentMode: 'UPI' },
    select: { id: true, status: true, transactionId: true, paymentMode: true },
  });

  const studentName = session?.user?.name || 'A student';
  await prisma.notification.create({
    data: {
      userId: payment.enrollment.batch.teacherId,
      title: 'Fee payment to confirm',
      message: `${studentName} reports paying ₹${payment.amount.toLocaleString('en-IN')} (${payment.description}, ${payment.enrollment.batch.name}) by UPI, reference ${reference}. Check it in your bank app, then mark it paid in the batch's Payment Ledger.`,
      type: 'FEE_DUE',
    },
  });
  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'PAYMENT_REPORTED',
    entityType: 'PaymentRecord',
    entityId: payment.id,
    metadata: { reference, previousStatus: payment.status },
    ...requestAuditContext(req),
  });

  return NextResponse.json(updated);
}

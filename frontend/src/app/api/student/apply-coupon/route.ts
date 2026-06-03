import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { code, batchId } = await req.json();

    const coupon = await (prisma as any).discountCoupon.findUnique({
      where: { code }
    });

    if (!coupon || !coupon.isActive) {
      return NextResponse.json({ error: 'Invalid or expired coupon' }, { status: 400 });
    }

    if (coupon.batchId && coupon.batchId !== batchId) {
      return NextResponse.json({ error: 'Coupon is not applicable to this batch' }, { status: 400 });
    }

    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    let discount = 0;
    if (coupon.discountPct) {
      discount = (batch as any).feeAmount * (coupon.discountPct / 100);
    } else if (coupon.discountAmt) {
      discount = coupon.discountAmt;
    }

    const newFee = Math.max(0, (batch as any).feeAmount - discount);

    return NextResponse.json({ 
      originalFee: (batch as any).feeAmount, 
      discount, 
      finalFee: newFee,
      couponCode: coupon.code
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


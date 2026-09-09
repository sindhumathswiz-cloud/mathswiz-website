import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { unstable_noStore as noStore } from "next/cache";

export const dynamic = 'force-dynamic';

export async function GET() {
    noStore();
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const coupons = await (prisma as any).discountCoupon.findMany({
            where: { batch: { teacherId: userId } },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ coupons });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { code, discountPct, discountAmt, batchId } = await req.json();

        if (!code || !batchId) return NextResponse.json({ error: "Code and batch are required" }, { status: 400 });

        const batch = await prisma.batch.findFirst({
            where: { id: batchId, teacherId: userId },
            select: { id: true },
        });
        if (!batch) return NextResponse.json({ error: "Batch not found or not owned by you" }, { status: 403 });

        const coupon = await (prisma as any).discountCoupon.create({
            data: {
                code: code.toUpperCase(),
                discountPct: discountPct ? parseFloat(discountPct) : null,
                discountAmt: discountAmt ? parseFloat(discountAmt) : null,
                batchId
            }
        });

        return NextResponse.json(coupon);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


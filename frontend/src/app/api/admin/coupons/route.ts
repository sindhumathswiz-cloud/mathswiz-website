import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const coupon = await (prisma as any).discountCoupon.create({
            data: {
                code: body.code,
                discountPct: body.discountPct || null,
                discountAmt: body.discountAmt || null,
                isActive: body.isActive ?? true,
                batchId: body.batchId || null
            }
        });
        return NextResponse.json(coupon, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create coupon" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, ...data } = body;
        const coupon = await (prisma as any).discountCoupon.update({
            where: { id },
            data
        });
        return NextResponse.json(coupon);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update coupon" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
        
        await (prisma as any).discountCoupon.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete coupon" }, { status: 500 });
    }
}


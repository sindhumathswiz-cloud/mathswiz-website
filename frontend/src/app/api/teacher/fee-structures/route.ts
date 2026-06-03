import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { unstable_noStore as noStore } from "next/cache";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        
        const teacherId = userId;
        const body = await req.json();
        const { name, totalAmount, installments } = body; 

        if (!name || totalAmount === undefined || !installments) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const newFeeStructure = await (prisma as any).feeStructure.create({
            data: {
                name,
                totalAmount: parseFloat(totalAmount),
                installments,
                teacherId
            }
        });

        return NextResponse.json(newFeeStructure);
    } catch (error: any) {
        console.error("FeeStructure Creation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    noStore();
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const teacherId = userId;

        const structures = await (prisma as any).feeStructure.findMany({
            where: { teacherId },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ feeStructures: structures });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


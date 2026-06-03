import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['ADMIN', 'TEACHER'].includes((session.user as any).role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { name, totalAmount, installments } = await req.json();
        const teacherId = (session.user as any).id;

        const feeStructure = await (prisma as any).feeStructure.create({
            data: {
                name,
                totalAmount,
                installments, // Prisma handles JSON
                teacherId
            }
        });

        return NextResponse.json(feeStructure);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


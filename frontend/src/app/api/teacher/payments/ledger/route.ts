import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { unstable_noStore as noStore } from "next/cache";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    noStore();
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const teacherId = userId;

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status'); // PAID, UNPAID, UPCOMING

        const whereClause: any = {
            enrollment: {
                batch: {
                    teacherId: teacherId
                }
            }
        };

        if (status) {
            whereClause.status = status;
        }

        const payments = await (prisma as any).paymentRecord.findMany({
            where: whereClause,
            include: {
                enrollment: {
                    include: {
                        student: { select: { id: true, firstName: true, lastName: true, email: true } },
                        batch: { select: { name: true, code: true, id: true } }
                    }
                }
            },
            orderBy: { dueDate: 'asc' }
        });

        return NextResponse.json({ payments });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


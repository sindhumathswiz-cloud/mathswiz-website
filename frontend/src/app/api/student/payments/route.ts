import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !(session.user as any)?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const studentId = (session.user as any).id;

        // Fetch all payment records for enrollments belonging to this student
        const payments = await (prisma as any).paymentRecord.findMany({
            where: {
                enrollment: {
                    studentId: studentId
                }
            },
            include: {
                enrollment: {
                    include: {
                        batch: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        const totalOutstanding = payments
            .filter((p: any) => p.status !== 'PAID')
            .reduce((sum: number, p: any) => sum + p.amount, 0);

        const overdueAmount = payments
            .filter((p: any) => p.status !== 'PAID' && new Date(p.dueDate) < new Date())
            .reduce((sum: number, p: any) => sum + p.amount, 0);

        return NextResponse.json({
            payments,
            totalOutstanding,
            overdueAmount
        });

    } catch (error) {
        console.error('Failed to fetch student payments:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


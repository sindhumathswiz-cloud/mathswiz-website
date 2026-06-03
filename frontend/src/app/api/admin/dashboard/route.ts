import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const totalBatches = await (prisma as any).batch.count();
        const totalUsers = await (prisma as any).user.count();
        
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const activeUsersCount = await (prisma as any).user.count({
            where: {
                OR: [
                    { lastLoginAt: { gte: fifteenMinutesAgo } },
                    { updatedAt: { gte: fifteenMinutesAgo } },
                    { attempts: { some: { startTime: { gte: fifteenMinutesAgo } } } }
                ]
            }
        });

        // Revenue: Sum of PAID PaymentRecords
        const totalPaidRes = await (prisma as any).paymentRecord.aggregate({
            where: { status: 'PAID' },
            _sum: { amount: true }
        });
        const totalRevenue = totalPaidRes._sum.amount || 0;

        const totalQuestions = await prisma.question.count();
        const approvedQuestions = await prisma.question.count({ where: { status: 'APPROVED' } });
        const pendingQuestions = await prisma.question.count({ where: { status: 'PENDING_REVIEW' } });

        const typeStats = await prisma.question.groupBy({ by: ['type'], _count: { _all: true } });
        const subjectStats = await prisma.question.groupBy({ by: ['subject'], _count: { _all: true } });
        const classStats = await prisma.question.groupBy({ by: ['class'], _count: { _all: true } });
        const difficultyStats = await prisma.question.groupBy({ by: ['difficulty'], _count: { _all: true } });

        const recentTests = await (prisma as any).test?.findMany({ take: 5, orderBy: { createdAt: 'desc' } }).catch(() => []);
        const totalAttempts = await (prisma as any).testAttempt?.count().catch(() => 0);

        // Fetch users and leads for the directory/CRM
        const users = await (prisma as any).user.findMany({ 
            take: 100, 
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { enrollments: true, attempts: true }
                }
            }
        });
        const leads = await (prisma as any).lead?.findMany({ take: 20, orderBy: { createdAt: 'desc' } }).catch(() => []);

        return NextResponse.json({
            stats: {
                totalRevenue: `₹ ${totalRevenue.toLocaleString('en-IN')}`,
                totalUsers,
                activeUsers: activeUsersCount,
                totalBatches
            },
            totalQuestions,
            totalApproved: approvedQuestions,
            totalPending: pendingQuestions,
            formats: typeStats,
            subjects: subjectStats,
            classes: classStats,
            difficulty: difficultyStats,
            recentTests,
            totalAttempts,
            users,
            leads
        });
    } catch (error: any) {
        console.error("Dashboard API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

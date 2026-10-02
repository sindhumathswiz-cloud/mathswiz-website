import React, { Suspense } from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "../dashboard/StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";
import { isPremiumSubscription } from '@/lib/subscription';

export default async function StudentTestsPage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div className="min-h-screen bg-gray-50 dark:bg-background text-gray-900 dark:text-foreground p-8">Please log in</div>;

    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { class: true, subscription: true } });
    const studentClass = user?.class;
    const isPremium = isPremiumSubscription(user?.subscription);

    // This page only ever renders the Premium-gated Tests tab -- skip the
    // full fetch (test content, attempt scores) for free students instead
    // of shipping it into page props behind a UI-only lock.
    const tests = isPremium ? await (prisma as any).testAssignment.findMany({
        where: {
            AND: [
                {
                    OR: [
                        { studentId: userId },
                        { batch: { enrollments: { some: { studentId: userId, status: 'APPROVED' } } } }
                    ]
                },
                { test: { class: studentClass } }
            ]
        },
        include: {
            test: {
                include: { attempts: { where: { userId: userId, status: 'SUBMITTED' } } }
            }
        },
        orderBy: { createdAt: 'desc' }
    }).catch(() => []) : [];

    return (
        <Suspense>
            <StudentDashboardClient
                initialEnrollments={[]}
                initialPayments={[]}
                initialSummary={{ totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }}
                initialMaterials={[]}
                initialTests={tests}
                initialAttempts={[]}
                initialGoal={null}
                defaultTab="tests"
                isPremium={isPremium}
            />
        </Suspense>
    );
}

import React, { Suspense } from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "../dashboard/StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";
import { isPremiumSubscription } from '@/lib/subscription';

export default async function StudentAchievePage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div>Please log in</div>;
    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { subscription: true } });
    const isPremium = isPremiumSubscription(user?.subscription);

    // This page only ever renders the Premium-gated Achieve tab -- skip the
    // full fetch for free students instead of shipping it into page props
    // behind a UI-only lock.
    const goal = isPremium ? await (prisma as any).studentGoal.findUnique({
        where: { userId }
    }).catch(() => null) : null;

    const progress = isPremium ? await (prisma as any).studentProgress.findMany({
        where: { userId },
        orderBy: { masteryScore: 'desc' }
    }).catch(() => []) : [];

    const pastAttempts = isPremium ? await (prisma as any).testAttempt.findMany({
        where: { userId: userId, status: 'SUBMITTED' },
        include: { test: true },
        orderBy: { endTime: 'desc' }
    }).catch(() => []) : [];

    return (
        <Suspense>
            <StudentDashboardClient
                initialEnrollments={[]}
                initialPayments={[]}
                initialSummary={{ totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }}
                initialMaterials={[]}
                initialTests={[]}
                initialAttempts={pastAttempts}
                initialGoal={goal}
                initialProgress={progress}
                defaultTab="achieve"
                isPremium={isPremium}
            />
        </Suspense>
    );
}

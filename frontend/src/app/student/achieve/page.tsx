import React from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "../dashboard/StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";

export default async function StudentAchievePage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div>Please log in</div>;

    const goal = await (prisma as any).studentGoal.findUnique({
        where: { userId }
    }).catch(() => null);

    const progress = await (prisma as any).studentProgress.findMany({
        where: { userId },
        orderBy: { masteryScore: 'desc' }
    }).catch(() => []);

    const pastAttempts = await (prisma as any).testAttempt.findMany({
        where: { userId: userId, status: 'SUBMITTED' },
        include: { test: true },
        orderBy: { endTime: 'desc' }
    }).catch(() => []);

    return (
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
        />
    );
}

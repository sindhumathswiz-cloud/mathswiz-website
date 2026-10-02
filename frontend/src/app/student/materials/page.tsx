import React, { Suspense } from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "../dashboard/StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";
import { isPremiumSubscription } from '@/lib/subscription';

export default async function StudentMaterialsPage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div>Please log in</div>;

    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { class: true, subscription: true } });
    const studentClass = user?.class;
    const isPremium = isPremiumSubscription(user?.subscription);

    // This page only ever renders the Premium-gated Materials tab -- skip
    // the fetch for free students instead of shipping the full library
    // (with download/video links) into page props behind a UI-only lock.
    const materials = isPremium ? await (prisma as any).material.findMany({
        where: { OR: [ { class: studentClass }, { isFree: true } ] },
        orderBy: { createdAt: 'desc' }
    }).catch(() => []) : [];

    return (
        <Suspense>
            <StudentDashboardClient
                initialEnrollments={[]}
                initialPayments={[]}
                initialSummary={{ totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }}
                initialMaterials={materials}
                initialTests={[]}
                initialAttempts={[]}
                initialGoal={null}
                defaultTab="materials"
                isPremium={isPremium}
            />
        </Suspense>
    );
}

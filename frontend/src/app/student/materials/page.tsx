import React from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "../dashboard/StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";

export default async function StudentMaterialsPage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div>Please log in</div>;

    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { class: true } });
    const studentClass = user?.class;

    const materials = await (prisma as any).material.findMany({
        where: { OR: [ { class: studentClass }, { isFree: true } ] },
        orderBy: { createdAt: 'desc' }
    }).catch(() => []);

    return (
        <StudentDashboardClient 
            initialEnrollments={[]} 
            initialPayments={[]} 
            initialSummary={{ totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }} 
            initialMaterials={materials} 
            initialTests={[]}
            initialAttempts={[]}
            initialGoal={null}
            defaultTab="materials"
        />
    );
}

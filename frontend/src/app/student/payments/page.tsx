import React from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "../dashboard/StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";

export default async function StudentPaymentsPage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div>Please log in</div>;

    const payments = await (prisma as any).paymentRecord.findMany({
        where: { enrollment: { studentId: userId } },
        include: { enrollment: { include: { batch: true } } },
        orderBy: { dueDate: 'asc' }
    }).catch(() => []);

    const totalAmount = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    const totalPaid = payments
        .filter((p: any) => p.status === 'PAID')
        .reduce((sum: number, p: any) => sum + p.amount, 0);
    const totalOutstanding = payments
        .filter((p: any) => p.status !== 'PAID')
        .reduce((sum: number, p: any) => sum + p.amount, 0);
    
    const overdueAmount = payments
        .filter((p: any) => p.status !== 'PAID' && p.dueDate && new Date(p.dueDate) < new Date())
        .reduce((sum: number, p: any) => sum + p.amount, 0);

    return (
        <StudentDashboardClient 
            initialEnrollments={[]} 
            initialPayments={payments} 
            initialSummary={{ totalAmount, totalPaid, totalOutstanding, overdueAmount }} 
            initialMaterials={[]} 
            initialTests={[]}
            initialAttempts={[]}
            initialGoal={null}
            defaultTab="payments"
        />
    );
}

import React from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentDashboardClient from "./StudentDashboardClient";
import { unstable_noStore as noStore } from "next/cache";

export default async function StudentDashboard() {
    noStore(); // CRITICAL: Disables all static caching for this route.

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const role = (session?.user as any)?.role;
    const email = session?.user?.email;

    const isSuperAdmin = email === process.env.SUPER_ADMIN_EMAIL || email === "superadmin@mathswiz.com";
    const isMasterAdmin = email === process.env.MASTER_ADMIN_EMAIL || email === "teacher@mathswiz.com";

    if (role === 'ADMIN' || isSuperAdmin) {
        const { redirect } = await import('next/navigation');
        redirect('/admin/dashboard');
    } else if (role === 'TEACHER' || isMasterAdmin) {
        const { redirect } = await import('next/navigation');
        redirect('/teacher/dashboard');
    }

    if (!userId) {
        return <StudentDashboardClient initialEnrollments={[]} initialPayments={[]} initialSummary={{ totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }} initialMaterials={[]} initialTests={[]} initialAttempts={[]} initialGoal={null} />;
    }

    try {
        // 1. Get Student Class
        const user = await (prisma as any).user.findUnique({
            where: { id: userId },
            select: { class: true }
        });
        const studentClass = user?.class;

        // 2. Fetch Enrollments
        const enrollments = await (prisma as any).batchEnrollment.findMany({
            where: { studentId: userId },
            include: { 
                batch: { 
                    include: { 
                        teacher: true,
                        liveClasses: {
                            where: { startTime: { gte: new Date() } },
                            orderBy: { startTime: 'asc' },
                            take: 5
                        }
                    }
                } 
            },
            orderBy: { createdAt: 'desc' }
        }).catch(() => []);

        // 3. Fetch Payments
        const payments = await (prisma as any).paymentRecord.findMany({
            where: { enrollment: { studentId: userId } },
            include: { enrollment: { include: { batch: true } } },
            orderBy: { dueDate: 'asc' }
        }).catch(() => []);

        // 4. Fetch Materials (Filtered by Class)
        const materials = await (prisma as any).material.findMany({
            where: { 
                OR: [
                    { class: studentClass },
                    { isFree: true } // Allow free materials to potentially bypass class if needed, or stick strictly to class
                ]
            },
            orderBy: { createdAt: 'desc' }
        }).catch(() => []);

        // 5. Fetch Test Assignments (Filtered by Class)
        const tests = await (prisma as any).testAssignment.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { studentId: userId },
                            { batch: { enrollments: { some: { studentId: userId, status: 'APPROVED' } } } }
                        ]
                    },
                    {
                        test: { class: studentClass }
                    }
                ]
            },
            include: { 
                test: {
                    include: { attempts: { where: { userId: userId, status: 'SUBMITTED' } } }
                } 
            },
            orderBy: { createdAt: 'desc' }
        }).catch(() => []);

        const pastAttempts = await (prisma as any).testAttempt.findMany({
            where: { userId: userId, status: 'SUBMITTED' },
            include: { test: true },
            orderBy: { endTime: 'desc' }
        }).catch(() => []);

        const goal = await (prisma as any).studentGoal.findUnique({
            where: { userId }
        }).catch(() => null);

        // Fetch Notices for enrolled batches
        const batchIds = enrollments.map((e: any) => e.batchId);
        const notices = await (prisma as any).notice.findMany({
            where: { batchId: { in: batchIds } },
            include: { teacher: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10
        }).catch(() => []);

        // Calculate Summary
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
                initialEnrollments={enrollments} 
                initialPayments={payments} 
                initialSummary={{ totalAmount, totalPaid, totalOutstanding, overdueAmount }} 
                initialMaterials={materials}
                initialTests={tests}
                initialAttempts={pastAttempts}
                initialGoal={goal}
                initialNotices={notices}
            />
        );
    } catch (error) {
        console.error("Student Dashboard Server Fetch Error:", error);
        return <StudentDashboardClient initialEnrollments={[]} initialPayments={[]} initialSummary={{ totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }} initialMaterials={[]} initialTests={[]} initialAttempts={[]} initialGoal={null} initialNotices={[]} />;
    }
}

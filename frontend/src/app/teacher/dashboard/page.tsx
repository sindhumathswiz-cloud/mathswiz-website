import React from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TeacherDashboardClient from "./TeacherDashboardClient";
import { Lock } from 'lucide-react';
import { redirect } from 'next/navigation';
import { buildWeeklyEngagement } from '@/lib/teacher-dashboard-metrics';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

import { unstable_noStore as noStore } from "next/cache";

export default async function TeacherDashboard() {
    noStore(); // CRITICAL: Disables all static caching for this route.
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) {
        redirect('/login');
    }

    if ((session?.user as any)?.accountStatus === 'PENDING') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-3">Pending Approval</h1>
                    <p className="text-gray-500 mb-6">
                        Your teacher account is currently under review by an administrator. You will gain access to the dashboard and study materials once approved.
                    </p>
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm text-gray-600">
                        If you have been waiting for more than 48 hours, please contact support.
                    </div>
                </div>
            </div>
        );
    }

    // DATA ISOLATION: ALL queries are scoped to this teacher's batches/data
    try {
        // Teacher's own batches only
        const batches = await (prisma as any).batch.findMany({
            where: { teacherId: userId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { enrollments: { where: { status: 'APPROVED' } } }
                }
            }
        }).catch(() => []);

        const batchIds = batches.map((b: any) => b.id);

        // Enrollments in teacher's batches (pending requests to approve)
        const pendingEnrollments = await (prisma as any).batchEnrollment.findMany({
            where: { status: 'PENDING', batchId: { in: batchIds } },
            include: { student: true, batch: true }
        }).catch(() => []);

        // Parents waiting approval — not batch-specific, keep unfiltered
        const pendingParents = await (prisma as any).user.findMany({
            where: {
                role: 'PARENT',
                accountStatus: 'PENDING',
                children: { some: { enrollments: { some: { batchId: { in: batchIds } } } } },
            }
        }).catch(() => []);

        // Payments only from teacher's batches
        const payments = await (prisma as any).paymentRecord.findMany({
            where: { enrollment: { batchId: { in: batchIds } } },
            include: {
                enrollment: {
                    include: {
                        student: { select: { firstName: true, lastName: true, email: true, mobileNumber: true } },
                        batch: { select: { name: true } }
                    }
                }
            },
            orderBy: { dueDate: 'asc' },
            take: 200
        }).catch(() => []);

        // Students approved in teacher's batches
        const totalEnrollments = await (prisma as any).batchEnrollment.count({
            where: { status: 'APPROVED', batchId: { in: batchIds } }
        }).catch(() => 0);

        // Materials created by this teacher
        const materials = await (prisma as any).material.findMany({
            where: { createdById: userId },
            orderBy: { createdAt: 'desc' },
            include: { createdBy: true }
        }).catch(() => []);

        // Leads — teacher-scoped (Task 6 Fix)
        const leads = await (prisma as any).lead.findMany({
            where: {
                OR: [
                    { teacherId: userId },
                    { teacherId: null } // Allow global leads to be visible if not yet assigned
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        }).catch(() => []);

        // Users within teacher's batches (for Reports)
        const users = await (prisma as any).user.findMany({
            where: { enrollments: { some: { batchId: { in: batchIds } } } },
            select: { id: true, firstName: true, lastName: true, email: true, role: true, accountStatus: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 200
        }).catch(() => []);

        // Notices created by this teacher
        const notices = await (prisma as any).notice.findMany({
            where: { teacherId: userId },
            include: { batch: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50
        }).catch(() => []);

        const formattedBatches = batches.map((b: any) => ({
            id: b.id,
            batchCode: b.code || b.batchCode,
            course: { title: b.name },
            studentCount: b._count.enrollments,
            oneNoteUrl: b.oneNoteUrl,
            teamChatUrl: b.teamChatUrl
        }));

        let pendingAssignments = 0;
        let liveTests = 0;
        let activeNow = 0;
        let doubtsCount = 0;
        let engagementData: Array<{ week: string; score: number }> = [];
        try {
            if (prisma.testAssignment) pendingAssignments = await prisma.testAssignment.count({
                where: { batch: { teacherId: userId || '' } }
            });
            if (prisma.test) liveTests = await prisma.test.count({
                where: { isPublished: true, createdById: userId || '' }
            });
            const activeSince = new Date(Date.now() - 15 * 60 * 1000);
            [activeNow, doubtsCount] = await Promise.all([
                prisma.user.count({
                    where: {
                        lastActiveAt: { gte: activeSince },
                        enrollments: { some: { status: 'APPROVED', batch: { teacherId: userId } } },
                    },
                }),
                prisma.teacherQuery.count({ where: { teacherId: userId, status: 'OPEN' } }),
            ]);
            const attempts = await prisma.testAttempt.findMany({
                where: {
                    status: { in: ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'] },
                    endTime: { gte: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000) },
                    user: { enrollments: { some: { status: 'APPROVED', batch: { teacherId: userId } } } },
                },
                select: { startTime: true, endTime: true, totalScore: true, test: { select: { totalMarks: true } } },
            });
            engagementData = buildWeeklyEngagement(attempts);
        } catch (e) {
            console.error("Test stats fetch error:", e);
        }

        return <TeacherDashboardClient 
            initialBatches={formattedBatches} 
            initialPendingEnrollments={pendingEnrollments}
            initialPendingParents={pendingParents}
            initialMaterials={materials}
            initialPayments={payments}
            initialLeads={leads}
            initialUsers={users}
            initialNotices={notices}
            initialEngagementData={engagementData}
            initialDoubtsCount={doubtsCount}
            teacherId={userId || ''}
            initialStats={{
                totalStudents: totalEnrollments,
                pendingAssignments,
                liveTests,
                activeNow
            }}
        />;
    } catch (error) {
        console.error("🔥 CRITICAL Dashboard Fetch Error:", error);
        return <TeacherDashboardClient 
            initialBatches={[]} 
            initialPendingEnrollments={[]} 
            initialPendingParents={[]}
            initialNotices={[]}
            teacherId={userId || ''}
            initialStats={{ totalStudents: 0, pendingAssignments: 0, liveTests: 0, activeNow: 0 }}
        />;
    }
}


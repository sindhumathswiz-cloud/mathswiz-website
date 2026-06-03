import prisma from "@/lib/prisma";
import AdminDashboardClient from "./AdminDashboardClient";
import { unstable_noStore as noStore } from "next/cache";
import { seedSiteData } from "@/lib/seed-site";

export default async function AdminDashboardPage() {
    // Force dynamic rendering for real-time dashboard data
    noStore();

    // Auto-seed site pages if missing
    await seedSiteData();

    // 1. Fetch Real Metrics
    const totalUsers = await (prisma as any).user.count();
    const totalBatches = await (prisma as any).batch.count();
    
    // Active sessions: users updated/active in the last 24 hours (as per Task 18 spec)
    const activeSessions = await (prisma as any).user.count({
        where: { 
            updatedAt: { 
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
            } 
        }
    });

    // Simple revenue sum (PAID payments)
    const revenueData = await (prisma as any).paymentRecord.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true }
    });
    const totalRevenue = revenueData._sum.amount || 0;

    // 2. Fetch User Directory
    const users = await (prisma as any).user.findMany({
        include: {
            _count: {
                select: {
                    enrollments: true,
                    testAttempts: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });






    // 3. Fetch Leads
    const leads = await prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    // 4. Fetch System Features Data (Graceful degradation for new models)
    const coupons = await (prisma as any).discountCoupon?.findMany({ take: 20 }).catch(() => []);
    const banners = await (prisma as any).banner?.findMany({ take: 5 }).catch(() => []);
    const notifications = await (prisma as any).notification?.findMany({ take: 10, orderBy: { createdAt: 'desc' } }).catch(() => []);
    const sitePages = await (prisma as any).sitePage?.findMany().catch(() => []);

    // 5. Granular Tab-Specific Metrics (Task 18)
    const totalQuestions = await prisma.question.count();
    const approvedQuestions = await prisma.question.count({ where: { status: 'APPROVED' } });
    const pendingQuestions = await prisma.question.count({ where: { status: 'PENDING_REVIEW' } });
    const draftQuestions = await prisma.question.count({ where: { status: 'DRAFT' } });

    // Scope-based stats
    const publicQuestions = await prisma.question.count({ where: { scope: 'PUBLIC' } });
    const teacherPrivateQuestions = await prisma.question.count({ where: { scope: 'TEACHER_PRIVATE' } });
    const pendingTeacherQuestions = await prisma.question.count({ where: { scope: 'TEACHER_PRIVATE', status: 'PENDING_REVIEW' } });

    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT' } });
    const activeEnrolled = await (prisma as any).batchEnrollment.count({ where: { status: 'APPROVED' } });
    const suspendedStudents = await (prisma as any).batchEnrollment.count({ where: { status: 'SUSPENDED' } });

    const totalTests = await prisma.test.count();
    const publishedTests = await prisma.test.count({ where: { isPublished: true } });

    // Pending teacher questions for review queue
    const pendingReviewQuestions = await prisma.question.findMany({
        where: { status: 'PENDING_REVIEW' },
        include: {
            createdBy: { select: { firstName: true, lastName: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    const stats = {
        totalUsers,
        totalBatches,
        activeSessions,
        revenue: totalRevenue,
        questionBank: { 
            total: totalQuestions, 
            approved: approvedQuestions, 
            pending: pendingQuestions,
            draft: draftQuestions,
            public: publicQuestions,
            teacherPrivate: teacherPrivateQuestions,
            pendingTeacherReview: pendingTeacherQuestions
        },
        userDirectory: { totalStudents, activeEnrolled, suspended: suspendedStudents },
        testEngine: { total: totalTests, published: publishedTests }
    };

    // 6. Fetch Payments for Fee Management
    const payments = await (prisma as any).paymentRecord.findMany({
        include: {
            enrollment: {
                include: {
                    student: { select: { firstName: true, lastName: true, email: true, mobileNumber: true } },
                    batch: { select: { name: true } }
                }
            }
        },
        orderBy: { dueDate: 'asc' },
        take: 100
    });

    return (
        <AdminDashboardClient 
            stats={stats} 
            users={users} 
            leads={leads} 
            coupons={coupons}
            banners={banners}
            notifications={notifications}
            sitePages={sitePages}
            payments={payments}
            pendingReviewQuestions={pendingReviewQuestions}
        />
    );
}

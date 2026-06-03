import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        let userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // IDENTITY HEALING: Ensure we use the real Database ID for all queries
        const dbUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!dbUser) return NextResponse.json({ error: "User not found in database" }, { status: 404 });
        
        // Overwrite userId with the true Database ID
        userId = dbUser.id;

        const [pendingEnrollments, pendingParents, totalEnrollments, batches, users] = await Promise.all([
            prisma.batchEnrollment.findMany({
                where: { status: 'PENDING', batch: { teacherId: userId } },
                include: { student: true, batch: true }
            }),
            prisma.user.findMany({
                where: { 
                    role: 'PARENT', 
                    accountStatus: 'PENDING',
                    children: {
                        some: {
                            enrollments: {
                                some: {
                                    batch: { teacherId: userId }
                                }
                            }
                        }
                    }
                }
            }),
            prisma.batchEnrollment.count({
                where: { status: 'APPROVED', batch: { teacherId: userId } }
            }),
            prisma.batch.findMany({
                where: { teacherId: userId },
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { enrollments: { where: { status: 'APPROVED' } } }
                    }
                }
            }),
            prisma.user.findMany({
                where: { enrollments: { some: { batch: { teacherId: userId } } } },
                select: { id: true, firstName: true, lastName: true, email: true, role: true, accountStatus: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 200
            })
        ]);

        let pendingAssignments = 0;
        let liveTests = 0;
        try {
            pendingAssignments = await prisma.testAssignment.count({
                where: {
                    OR: [
                        { test: { createdById: userId } },
                        { batch: { teacherId: userId } }
                    ]
                }
            });
            liveTests = await prisma.test.count({ 
                where: { 
                    createdById: userId,
                    isPublished: true 
                } 
            });
        } catch (e) {
            console.error("Scoping error in teacher dashboard-data:", e);
        }

        return NextResponse.json({
            pendingEnrollments,
            pendingParents,
            totalStudents: totalEnrollments,
            pendingAssignments,
            liveTests,
            batches: batches.map((b: any) => ({
                id: b.id,
                batchCode: b.code || b.batchCode,
                course: { title: b.name },
                studentCount: b._count.enrollments,
                oneNoteUrl: b.oneNoteUrl,
                teamChatUrl: b.teamChatUrl
            })),
            users: users || []
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to load teacher data" }, { status: 500 });
    }
}


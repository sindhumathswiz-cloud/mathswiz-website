import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "PARENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const parentUser = await (prisma as any).user.findUnique({
            where: { id: (session.user as any).id },
            include: {
                parentLinks: {
                    include: {
                        student: {
                            include: {
                                enrollments: { include: { batch: true } },
                                testAttempts: { orderBy: { startTime: 'desc' }, take: 5 }
                            }
                        }
                    }
                }
            }
        });

        if (!parentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
        
        const linkedStudent = parentUser.parentLinks?.[0]?.student;
        if (!linkedStudent) {
            return NextResponse.json({ error: "No student linked to this guardian account." }, { status: 404 });
        }

        // Real attendance calculation
        const attendanceRecords = await (prisma as any).attendanceRecord.findMany({
            where: { studentId: linkedStudent.id },
        });
        const presentCount = attendanceRecords.filter((r: any) => r.status === 'PRESENT').length;
        const totalDays = attendanceRecords.length;
        const attendancePercent = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;

        // Real streak calculation (consecutive days with test attempts)
        const allTestAttempts = await (prisma as any).testAttempt.findMany({
            where: { studentId: linkedStudent.id },
            orderBy: { startTime: 'desc' },
            select: { startTime: true },
        });

        let currentStreak = 0;
        if (allTestAttempts.length > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            for (let i = 0; i < 365; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() - i);
                
                const hasAttemptOnDay = allTestAttempts.some((a: any) => {
                    const attemptDate = new Date(a.startTime);
                    attemptDate.setHours(0, 0, 0, 0);
                    return attemptDate.getTime() === checkDate.getTime();
                });

                if (hasAttemptOnDay) {
                    currentStreak++;
                } else if (i > 0) {
                    break;
                }
            }
        }

        // Real rank calculation among batch peers
        const enrollments = linkedStudent.enrollments || [];
        let globalRank = 0;
        let totalStudents = 0;

        if (enrollments.length > 0) {
            const batchIds = enrollments.map((e: any) => e.batchId);
            
            const allStudentsInBatches = await (prisma as any).batchEnrollment.findMany({
                where: { batchId: { in: batchIds }, status: 'APPROVED' },
                select: { studentId: true },
                distinct: ['studentId'],
            });

            totalStudents = allStudentsInBatches.length;

            const childAllAttempts = await (prisma as any).testAttempt.findMany({
                where: { studentId: linkedStudent.id },
                select: { score: true, totalScore: true },
            });

            const childAvgScore = childAllAttempts.length > 0
                ? childAllAttempts.reduce((sum: number, a: any) => sum + (a.totalScore || a.score || 0), 0) / childAllAttempts.length
                : 0;

            let rankPosition = 1;
            for (const student of allStudentsInBatches) {
                if (student.studentId === linkedStudent.id) continue;

                const studentAttempts = await (prisma as any).testAttempt.findMany({
                    where: { studentId: student.studentId },
                    select: { score: true, totalScore: true },
                });

                const studentAvg = studentAttempts.length > 0
                    ? studentAttempts.reduce((sum: number, a: any) => sum + (a.totalScore || a.score || 0), 0) / studentAttempts.length
                    : 0;

                if (studentAvg > childAvgScore) {
                    rankPosition++;
                }
            }

            globalRank = Math.round(((totalStudents - rankPosition + 1) / totalStudents) * 100);
        }

        // Real Batch Average for tests
        const enrichedScores = await Promise.all(linkedStudent.testAttempts.map(async (ta: any) => {
             const allAttempts = await (prisma as any).testAttempt.findMany({ where: { testId: ta.testId } });
             const validScores = allAttempts.map((a: any) => a.totalScore).filter((s: any) => s !== null);
             const avg = validScores.length > 0 ? validScores.reduce((a: number, b: number) => a + (b || 0), 0) / validScores.length : 0;
             
             const test = ta.testId ? await (prisma as any).test.findUnique({ where: { id: ta.testId }, select: { title: true } }) : null;
             
             return {
                 test: test?.title || `Test ${ta.testId?.substring(0,6) || ta.id.substring(0,6)}`,
                 score: ta.totalScore || 0,
                 avg: Math.round(avg),
                 date: new Date(ta.submittedAt || ta.startTime || Date.now()).toLocaleDateString('en-IN')
             }
        }));

        const stats = {
            studentName: `${linkedStudent.firstName || ''} ${linkedStudent.lastName || ''}`.trim() || linkedStudent.email,
            aiTokensUsed: 5 - (linkedStudent.aiTokens || 0),
            attendancePercent,
            currentStreak,
            globalRank,
            recentScores: enrichedScores
        };

        return NextResponse.json({ success: true, stats });
    } catch (error: any) {
        console.error("Parent dashboard error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

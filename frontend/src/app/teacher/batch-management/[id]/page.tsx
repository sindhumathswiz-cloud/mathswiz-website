import { unstable_noStore as noStore } from "next/cache";
import prisma from "@/lib/prisma";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS language server incorrectly reports this as missing; file exists at ./ManageBatchClient.tsx
import ManageBatchClient from "./ManageBatchClient";

export default async function ManageBatchPage({ params }: { params: Promise<{ id: string }> }) {
    noStore(); // Prevent aggressive caching
    const resolvedParams = await params;

    // Fetch the batch AND its enrolled students simultaneously
    const batch = await (prisma as any).batch.findUnique({
        where: { id: resolvedParams.id },
        include: {
            enrollments: {
                where: { status: { in: ['APPROVED', 'SUSPENDED'] } },
                include: { student: true, feeStructure: true }
            },
            assignments: {
                include: { test: true }
            }
        }
    });

    if (!batch) {
        return <div className="p-10 text-center text-red-500">Batch not found or deleted.</div>;
    }

    // Fetch tests to allow assigning them
    const tests = await prisma.test.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true }
    }).catch(() => []);

    // Fetch all attempts for students in this batch for the assigned tests
    const studentIds = batch.enrollments.map((e: any) => e.studentId);
    const assignedTestIds = batch.assignments.map((a: any) => a.testId);

    const attempts = await (prisma as any).testAttempt.findMany({
        where: {
            userId: { in: studentIds },
            testId: { in: assignedTestIds }
        },
        include: {
            user: { select: { firstName: true, lastName: true } },
            test: { select: { title: true, totalMarks: true } }
        },
        orderBy: { endTime: 'desc' }
    }).catch(() => []);

    return <ManageBatchClient batch={batch} availableTests={tests} initialAttempts={attempts} />;
}

import React from 'react';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unstable_noStore as noStore } from "next/cache";
import MockTestsClient from "./MockTestsClient";

export default async function MockTestsPage() {
    noStore();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) return <div>Please log in</div>;

    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { class: true } });
    const studentClass = user?.class;

    const mockTests = await (prisma as any).testAssignment.findMany({
        where: {
            AND: [
                {
                    OR: [
                        { studentId: userId },
                        { batch: { enrollments: { some: { studentId: userId, status: 'APPROVED' } } } }
                    ]
                },
                { test: { class: studentClass, templateType: 'MOCK_EXAM' } }
            ]
        },
        include: {
            test: {
                include: { attempts: { where: { userId: userId, status: 'SUBMITTED' } } }
            }
        },
        orderBy: { createdAt: 'desc' }
    }).catch(() => []);

    return <MockTestsClient assignments={mockTests} />;
}

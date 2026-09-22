import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ParentDashboardClient from './ParentDashboardClient';

export default async function ParentDashboardPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'PARENT') redirect('/login');

    const parentLinks = await prisma.parentLink.findMany({
        where: { parentId: session.user.id },
        include: {
            student: {
                include: {
                    enrollments: { include: { payments: true } },
                    testAttempts: { where: { status: 'SUBMITTED' }, orderBy: { endTime: 'desc' }, take: 10 },
                    studentGoal: true,
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    const students = parentLinks.map((link) => link.student);

    return <ParentDashboardClient initialStudents={students} />;
}

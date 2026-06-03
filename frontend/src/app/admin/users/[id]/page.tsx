import prisma from "@/lib/prisma";
import UserProfileClient from "./UserProfileClient";
import { notFound } from "next/navigation";

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const user = await (prisma as any).user.findUnique({
        where: { id },
        include: {
            enrollments: {
                include: {
                    batch: true,
                    feeStructure: true,
                    payments: {
                        orderBy: { dueDate: 'asc' }
                    }
                }
            },
            testAttempts: {
                include: {
                    test: true
                },
                orderBy: { startTime: 'desc' }
            }
        }
    });

    if (!user) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <UserProfileClient user={user} />
        </div>
    );
}

import React from 'react';
import prisma from "@/lib/prisma";
import BatchManagementClient from "./BatchManagementClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BatchManagementPage() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role === 'STUDENT') {
        redirect("/login");
    }

    const batches = await prisma.batch.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            _count: {
                select: { enrollments: { where: { status: 'APPROVED' } } }
            }
        }
    });

    return <BatchManagementClient initialBatches={batches as any} />;
}

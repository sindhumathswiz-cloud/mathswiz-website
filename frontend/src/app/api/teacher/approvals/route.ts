import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { targetId, action, type } = body;
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        const role = (session?.user as any)?.role;

        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (role !== 'TEACHER' && role !== 'ADMIN') {
            return NextResponse.json({ error: "Access Denied" }, { status: 403 });
        }

        if (type === 'ENROLLMENT') {
            // Verify the batch belongs to this teacher
            const enrollment = await prisma.batchEnrollment.findUnique({
                where: { id: targetId },
                include: { batch: { select: { teacherId: true } } }
            });
            if (!enrollment || (role !== 'ADMIN' && enrollment.batch.teacherId !== userId)) {
                return NextResponse.json({ error: "Access Denied" }, { status: 403 });
            }
            await prisma.batchEnrollment.update({
                where: { id: targetId },
                data: { status: action } // 'APPROVED' or 'REJECTED'
            });
        }
        else if (type === 'PARENT') {
            // Parents are global, but a teacher may only approve a parent who
            // has a child enrolled in one of THIS teacher's batches -- admins
            // can approve any parent.
            if (role !== 'ADMIN') {
                const parent = await prisma.user.findFirst({
                    where: {
                        id: targetId,
                        role: 'PARENT',
                        parentLinks: { some: { student: { enrollments: { some: { batch: { teacherId: userId } } } } } },
                    },
                    select: { id: true },
                });
                if (!parent) return NextResponse.json({ error: "Access Denied" }, { status: 403 });
            }
            await prisma.user.update({
                where: { id: targetId },
                data: { accountStatus: action } as any
            });
        }

        await recordAuditLog({
            actorId: userId,
            actorRole: (session?.user as any)?.role,
            action: type === 'ENROLLMENT' ? "ENROLLMENT_STATUS_CHANGED" : "PARENT_ACCOUNT_STATUS_CHANGED",
            entityType: type === 'ENROLLMENT' ? "BatchEnrollment" : "User",
            entityId: targetId,
            metadata: { status: action },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to process approval" }, { status: 500 });
    }
}


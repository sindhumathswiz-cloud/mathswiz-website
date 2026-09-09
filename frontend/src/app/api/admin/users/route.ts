import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await req.json();
        const { userId, action, role, password } = body;

        const updateData: any = {};

        if (action === 'APPROVE') updateData.accountStatus = 'APPROVED';
        if (action === 'REJECT') updateData.accountStatus = 'REJECTED';
        if (action === 'BLOCK') updateData.accountStatus = 'BLOCKED';
        if (action === 'UNBLOCK') updateData.accountStatus = 'APPROVED';
        if (action === 'FORCE_RESET') {
            if (typeof password !== "string" || password.length < 8) {
                return NextResponse.json({ error: "A password of at least 8 characters is required" }, { status: 400 });
            }
            updateData.password = await hash(password, 12);
        }
        if (action === 'UPDATE_ROLE') updateData.role = role;

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        await recordAuditLog({
            actorId: (session.user as any).id,
            actorRole: (session.user as any).role,
            action: `USER_${action}`,
            entityType: "User",
            entityId: userId,
            metadata: action === 'UPDATE_ROLE' ? { role } : { accountStatus: updateData.accountStatus },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ success: true, user });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}


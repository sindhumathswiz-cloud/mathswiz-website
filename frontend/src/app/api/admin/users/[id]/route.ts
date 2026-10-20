import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        const actor = session?.user as { id?: string; role?: string } | undefined;

        if (!actor?.id || actor.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }

        if (id === actor.id) {
            return NextResponse.json({ error: "You cannot delete your own administrator account" }, { status: 400 });
        }

        const user = await (prisma as any).user.findUnique({
            where: { id },
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await (prisma as any).user.delete({ where: { id } });

        try {
            await recordAuditLog({
                actorId: actor.id,
                actorRole: actor.role,
                action: "USER_DELETED",
                entityType: "User",
                entityId: id,
                metadata: {
                    name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
                    email: user.email,
                    role: user.role,
                },
                ...requestAuditContext(request),
            });
        } catch (auditError) {
            console.error("User was deleted but the audit event could not be saved:", auditError);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete user:", error);
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
}

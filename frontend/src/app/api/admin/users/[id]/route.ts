import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";
import { describeReferences, USER_REFERENCES, type ReferenceCount } from "@/lib/user-references";

export const dynamic = "force-dynamic";

const delegateOf = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/** How many rows of each kind point at this user. */
async function referencesTo(userId: string): Promise<ReferenceCount[]> {
    return Promise.all(USER_REFERENCES.map(async (ref) => ({
        ...ref,
        count: await (prisma as any)[delegateOf(ref.model)].count({ where: { [ref.field]: userId } }),
    })));
}

/**
 * Deletes a user, but only one that has nothing attached: no content they made, no teaching, no learning history.
 * Anything else is refused with what is in the way, and the admin is pointed at blocking the account instead
 * (PATCH /api/admin/users with action BLOCK), which stops them signing in and keeps everything.
 */
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

        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "This user";
        const references = (await referencesTo(id)).filter((r) => r.count > 0);
        if (references.length > 0) {
            return NextResponse.json({
                error: `${name} cannot be deleted: they have ${describeReferences(references)}. Block the account instead: it stops them signing in and keeps their records.`,
                code: "USER_HAS_RECORDS",
                references: references.map(({ model, field, label, one, count }) => ({ model, field, label: count === 1 ? one : label, count })),
                canBlock: true,
            }, { status: 409 });
        }

        try {
            await (prisma as any).user.delete({ where: { id } });
        } catch (deleteError: any) {
            // Something was added between the check and the delete.
            if (deleteError?.code === "P2003") {
                return NextResponse.json({
                    error: `${name} cannot be deleted: other records still point at this account. Block the account instead.`,
                    code: "USER_HAS_RECORDS",
                    canBlock: true,
                }, { status: 409 });
            }
            throw deleteError;
        }

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

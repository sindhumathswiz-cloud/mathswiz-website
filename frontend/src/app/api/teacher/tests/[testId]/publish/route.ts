import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ testId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (role !== "TEACHER" && role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { testId } = await params;
        const body = await req.json().catch(() => null);
        if (typeof body?.isPublished !== "boolean") {
            return NextResponse.json({ error: "isPublished (boolean) is required" }, { status: 400 });
        }

        const test = await prisma.test.findFirst({
            where: { id: testId, ...(role === "ADMIN" ? {} : { createdById: userId }) },
            select: { id: true },
        });
        if (!test) return NextResponse.json({ error: "Test not found or not owned by you" }, { status: 403 });

        const updated = await prisma.test.update({
            where: { id: testId },
            data: { isPublished: body.isPublished },
        });

        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: body.isPublished ? "TEST_PUBLISHED" : "TEST_UNPUBLISHED",
            entityType: "Test",
            entityId: testId,
            metadata: { isPublished: body.isPublished },
            ...requestAuditContext(req),
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Test Publish Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

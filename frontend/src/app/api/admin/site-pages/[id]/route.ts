import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
        const { id } = await params;
        const { content, globalSettings, title, isPublished } = await req.json();

        const updated = await prisma.sitePage.update({
            where: { id },
            data: {
                content: content !== undefined ? content : undefined,
                globalSettings: globalSettings !== undefined ? globalSettings : undefined,
                title: title !== undefined ? title : undefined,
                isPublished: isPublished !== undefined ? isPublished : undefined,
            }
        });

        await recordAuditLog({
            actorId: (session.user as any).id,
            actorRole: (session.user as any).role,
            action: "SITE_PAGE_UPDATED",
            entityType: "SitePage",
            entityId: id,
            metadata: {
                changedFields: Object.entries({ content, globalSettings, title, isPublished })
                    .filter(([, value]) => value !== undefined)
                    .map(([key]) => key),
                isPublished,
            },
            ...requestAuditContext(req),
        });

        return NextResponse.json({ page: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const page = await prisma.sitePage.findUnique({ where: { id } });
        return NextResponse.json({ page });
    } catch (error) {
        return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
    }
}

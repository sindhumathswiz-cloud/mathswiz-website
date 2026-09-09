import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

const bannerSchema = z.object({
    title: z.string().trim().min(1).max(120),
    imageUrl: z.string().url(),
    linkUrl: z.string().url().optional().or(z.literal("")),
    isActive: z.boolean().optional(),
});

async function requireAdmin() {
    const session = await getServerSession(authOptions);
    return session && (session.user as any).role === 'ADMIN' ? session : null;
}

export async function POST(req: Request) {
    try {
        const session = await requireAdmin();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        const parsed = bannerSchema.safeParse(await req.json());
        if (!parsed.success) return NextResponse.json({ error: "Valid title and image URL are required" }, { status: 400 });
        const body = parsed.data;
        const banner = await (prisma as any).banner.create({
            data: {
                title: body.title,
                imageUrl: body.imageUrl,
                linkUrl: body.linkUrl || null,
                isActive: body.isActive ?? true
            }
        });
        await recordAuditLog({
            actorId: (session.user as any).id, actorRole: (session.user as any).role,
            action: "BANNER_CREATED", entityType: "Banner", entityId: banner.id,
            metadata: { title: body.title, isActive: body.isActive ?? true }, ...requestAuditContext(req),
        });
        return NextResponse.json(banner, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create banner" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await requireAdmin();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        const rawBody = await req.json();
        const { id } = rawBody;
        const parsed = bannerSchema.partial().safeParse(rawBody);
        if (!id || !parsed.success) return NextResponse.json({ error: "Invalid banner update" }, { status: 400 });
        const data = parsed.data;
        const banner = await (prisma as any).banner.update({
            where: { id },
            data
        });
        await recordAuditLog({
            actorId: (session.user as any).id, actorRole: (session.user as any).role,
            action: "BANNER_UPDATED", entityType: "Banner", entityId: id,
            metadata: { changedFields: Object.keys(data) }, ...requestAuditContext(req),
        });
        return NextResponse.json(banner);
    } catch {
        return NextResponse.json({ error: "Failed to update banner" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await requireAdmin();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
        
        await (prisma as any).banner.delete({ where: { id } });
        await recordAuditLog({
            actorId: (session.user as any).id, actorRole: (session.user as any).role,
            action: "BANNER_DELETED", entityType: "Banner", entityId: id,
            ...requestAuditContext(req),
        });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed to delete banner" }, { status: 500 });
    }
}


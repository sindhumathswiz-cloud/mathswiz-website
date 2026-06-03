import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const banner = await (prisma as any).banner.create({
            data: {
                title: body.title,
                imageUrl: body.imageUrl,
                linkUrl: body.linkUrl || null,
                isActive: body.isActive ?? true
            }
        });
        return NextResponse.json(banner, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create banner" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, ...data } = body;
        const banner = await (prisma as any).banner.update({
            where: { id },
            data
        });
        return NextResponse.json(banner);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update banner" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
        
        await (prisma as any).banner.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete banner" }, { status: 500 });
    }
}


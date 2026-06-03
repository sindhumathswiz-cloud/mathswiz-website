import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const pages = await prisma.sitePage.findMany({
            orderBy: { updatedAt: 'desc' }
        });
        return NextResponse.json({ pages });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch pages" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { title, slug, content, globalSettings } = await req.json();
        const page = await prisma.sitePage.create({
            data: {
                title,
                slug,
                content: content || {},
                globalSettings: globalSettings || {},
                isPublished: false
            }
        });
        return NextResponse.json({ page });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
        await prisma.sitePage.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
    }
}


import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
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

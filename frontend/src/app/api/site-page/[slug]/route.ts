import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const page = await prisma.sitePage.findUnique({
            where: { slug }
        });

        if (!page) {
            return NextResponse.json({ error: "Page not found" }, { status: 404 });
        }

        return NextResponse.json(page);
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
    try {
        const batches = await (prisma as any).batch.findMany({
            include: {
                teacher: { select: { firstName: true, lastName: true } },
                _count: { select: { enrollments: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(batches);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { name, code, class: classLevel, startDate, teacherId } = await req.json();

        if (!name || !code || !teacherId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const batch = await (prisma as any).batch.create({
            data: {
                name,
                code,
                class: classLevel,
                startDate: startDate ? new Date(startDate) : null,
                teacherId
            }
        });

        return NextResponse.json(batch);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: "Batch code already exists" }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


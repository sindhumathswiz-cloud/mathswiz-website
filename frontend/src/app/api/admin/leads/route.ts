import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const lead = await prisma.lead.create({
            data: {
                name: body.name,
                email: body.email,
                phone: body.phone,
                source: body.source,
                courseInterest: body.courseInterest,
                notes: body.notes,
                status: 'NEW',
                teacherId: body.teacherId || null
            }
        });
        return NextResponse.json({ lead }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to add lead" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, status, notes } = body;
        const updateData: any = {};
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const lead = await prisma.lead.update({
            where: { id },
            data: updateData
        });
        return NextResponse.json({ lead });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
    }
}


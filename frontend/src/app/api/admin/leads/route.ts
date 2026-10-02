import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { requirePremiumTeacher } from "@/lib/teacher-api-guard";

export const dynamic = 'force-dynamic';

// Lead CRM is a Premium-gated teacher feature (also used by the admin
// dashboard's own Lead CRM view). This route had no auth check at all --
// anyone could create or update any lead by id.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = await requirePremiumTeacher(session);
        if (!guard.ok) return guard.response;

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
                teacherId: guard.role === "ADMIN" ? (body.teacherId || null) : guard.userId
            }
        });
        return NextResponse.json({ lead }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to add lead" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = await requirePremiumTeacher(session);
        if (!guard.ok) return guard.response;

        const body = await req.json();
        const { id, status, notes } = body;

        const owned = await prisma.lead.findFirst({
            where: { id, ...(guard.role === "ADMIN" ? {} : { OR: [{ teacherId: guard.userId }, { teacherId: null }] }) },
            select: { id: true },
        });
        if (!owned) return NextResponse.json({ error: "Lead not found or not owned by you" }, { status: 403 });

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


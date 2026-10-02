import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireTeacherOrAdmin } from "@/lib/teacher-api-guard";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const guard = requireTeacherOrAdmin(session);
        if (!guard.ok) return guard.response;
        const { userId, role } = guard;

        const batches = await (prisma as any).batch.findMany({
            where: role === "ADMIN" ? {} : { teacherId: userId },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(batches || []);
    } catch (error: any) {
        console.error("Teacher Batches GET Error:", error);
        return NextResponse.json([], { status: 200 }); // Prevent frontend crash
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = requireTeacherOrAdmin(session);
        if (!guard.ok) return guard.response;
        const { userId, role } = guard;

        const body = await req.json();
        const { name, code, startDate, teacherId } = body;

        const resolvedTeacherId = role === "ADMIN" ? teacherId : userId;

        if (!name || !code) return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
        if (!resolvedTeacherId) return NextResponse.json({ error: "Unauthorized: Missing Teacher ID" }, { status: 401 });

        // Check if the batch code already exists in the entire database
        const existingBatch = await prisma.batch.findUnique({
            where: { code } as any
        });
        
        if (existingBatch) {
            return NextResponse.json(
                { error: "Batch code already exists. Please choose a unique code." }, 
                { status: 400 }
            );
        }

        const newBatch = await prisma.batch.create({
            data: {
                name,
                code,
                startDate: startDate ? new Date(startDate) : null,
                teacherId: resolvedTeacherId
            } as any
        });

        return NextResponse.json(newBatch);
    } catch (error: any) {
        console.error("Batch Creation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


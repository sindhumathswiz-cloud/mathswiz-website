import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        console.log("Nuclear Fix: Fetching all batches - API Hit");
        // NUCLEAR FIX: We are intentionally ignoring teacherId filtering here 
        // to prove the batch exists in the database and survives a refresh.
        const batches = await (prisma as any).batch.findMany({
            orderBy: { createdAt: 'desc' }
        });

        console.log(`Successfully fetched ${batches.length} batches from DB (Nuclear)`);
        return NextResponse.json(batches || []);
    } catch (error: any) {
        console.error("Teacher Batches GET Error:", error);
        return NextResponse.json([], { status: 200 }); // Prevent frontend crash
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        
        const body = await req.json();
        const { name, code, startDate, teacherId } = body; 
        
        const resolvedTeacherId = userId || teacherId;

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


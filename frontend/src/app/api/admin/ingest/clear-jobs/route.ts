import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        await (prisma as any).ingestionJob.deleteMany({});
        return NextResponse.json({ success: true, message: "All stuck jobs deleted." });
    } catch (e: any) { 
        return NextResponse.json({ error: e.message }, { status: 500 }); 
    }
}
